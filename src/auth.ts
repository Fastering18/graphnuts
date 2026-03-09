import NextAuth, { CredentialsSignin } from "next-auth"
import GitHub from "next-auth/providers/github"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || "https://dummy-1234.convex.cloud");

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        GitHub({
            clientId: process.env.GIT_CLIENT_ID,
            clientSecret: process.env.GIT_CLIENT_SECRET,
        }),
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
                action: { label: "Action", type: "text" }, // "login" | "register"
                name: { label: "Name", type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new CredentialsSignin("Missing email or password");
                }
                const email = credentials.email as string;
                const password = credentials.password as string;
                const action = (credentials.action as string) || "login";
                const nameStr = (credentials.name as string) || email.split("@")[0];

                try {
                    const existingUser = await convex.query(api.users.getUserByEmail, { email });

                    if (action === "register") {
                        if (existingUser) {
                            throw new CredentialsSignin("Email already in use.");
                        }
                        const hashedPassword = await bcrypt.hash(password, 10);
                        const newId = crypto.randomUUID();
                        await convex.mutation(api.users.createUserCredentials, {
                            id: newId,
                            name: nameStr,
                            email: email,
                            password: hashedPassword,
                        });
                        return { id: newId, name: nameStr, email: email };
                    } else {
                        // login
                        if (!existingUser || !existingUser.password) {
                            throw new CredentialsSignin("Invalid credentials.");
                        }
                        const isValid = await bcrypt.compare(password, existingUser.password);
                        if (!isValid) {
                            throw new CredentialsSignin("Invalid credentials.");
                        }
                        return { id: existingUser.id, name: existingUser.name, email: existingUser.email };
                    }
                } catch (e) {
                    throw e instanceof Error ? e : new Error("Authentication failed");
                }
            }
        })
    ],
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            if (user && user.id) {
                // Sync user to Convex on login
                const syncedUser = await convex.mutation(api.users.syncUser, {
                    id: user.id,
                    githubId: account?.provider === "github" ? account.providerAccountId : undefined,
                    name: user.name ?? undefined,
                    email: user.email ?? undefined,
                    image: user.image ?? undefined,
                });

                // Crucial: Override the NextAuth user.id with the canonical Convex Database ID 
                // returned by the sync mutation. This ensures that when linking accounts, 
                // the session inherits the existing User's ID rather than creating a split brain.
                if (syncedUser) {
                    user.id = syncedUser.id;
                }
            }
            return true;
        },
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
                // In a real app we can attach role here from token or DB
                (session.user as any).role = token.role || "user";
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
                // Assign default role, we can fetch from Convex if needed
                // Or if email matches admin email
                if (user.email === "admin_email_from_env_or_first_user") {
                    token.role = "admin";
                } else {
                    token.role = "user";
                }
            }
            return token;
        }
    }
})
