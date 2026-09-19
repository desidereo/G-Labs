import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { config } from "@/lib/config";

async function verifyPassword(
  plain: string,
  stored: string | undefined,
): Promise<boolean> {
  if (!stored) return false;
  // Support bcrypt hash or plaintext for simple single-user setup
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config.auth.secret,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");

        if (config.demoMode) {
          if (username === "demo" && password === "demo") {
            return { id: "demo", name: "demo", email: "demo@local" };
          }
          // Also allow configured user in demo if password matches
        }

        if (!config.auth.password && !config.demoMode) {
          return null;
        }

        const userOk = username === config.auth.user;
        const passOk = config.demoMode
          ? password === "demo" ||
            (await verifyPassword(password, config.auth.password))
          : await verifyPassword(password, config.auth.password);

        if (userOk && passOk) {
          return {
            id: config.auth.user,
            name: config.auth.user,
            email: `${config.auth.user}@local`,
          };
        }

        // Live mode requires AUTH_PASSWORD
        if (!config.demoMode && !config.auth.password) {
          return null;
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
