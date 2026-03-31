import type { NextAuthOptions } from "next-auth";
import type { Role } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const AUTH_QUERY_TIMEOUT_MS = 8000;
const AUTH_PASSWORD_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("AUTH_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials?: Record<"email" | "password", string>) {
        const values = credentials as
          | { email?: string; password?: string }
          | undefined;

        if (!values?.email || !values?.password) {
          return null;
        }

        let user: Awaited<ReturnType<typeof prisma.user.findUnique>> | null = null;
        try {
          user = await withTimeout(
            prisma.user.findUnique({
              where: { email: values.email },
            }),
            AUTH_QUERY_TIMEOUT_MS
          );
        } catch {
          return null;
        }
        const userWithPassword = user as
          | (typeof user & { passwordHash?: string | null })
          | null;

        if (!userWithPassword?.passwordHash) {
          return null;
        }

        let isValid = false;
        try {
          isValid = await withTimeout(
            verifyPassword(values.password, userWithPassword.passwordHash),
            AUTH_PASSWORD_TIMEOUT_MS
          );
        } catch {
          return null;
        }

        if (!isValid) {
          return null;
        }

        return {
          id: userWithPassword.id,
          name: userWithPassword.name,
          email: userWithPassword.email,
          image: userWithPassword.image,
          role: userWithPassword.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};
