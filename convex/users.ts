import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncUser = mutation({
    args: {
        id: v.string(),
        githubId: v.optional(v.string()),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        image: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("id", args.id))
            .first();

        if (existing) {
            // Update info if changed or link github account
            const updates: any = {};
            if (args.name && existing.name !== args.name) updates.name = args.name;
            if (args.image && existing.image !== args.image) updates.image = args.image;
            if (args.githubId && !existing.githubId) updates.githubId = args.githubId;

            if (Object.keys(updates).length > 0) {
                await ctx.db.patch(existing._id, updates);
            }
            return existing;
        }

        // 2. If no token match, but GitHub is authenticating, check by exact email and link them!
        if (args.email && args.githubId) {
            const emailMatch = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", args.email))
                .first();

            if (emailMatch) {
                const updates: any = { githubId: args.githubId };
                if (!emailMatch.image && args.image) updates.image = args.image;
                if (!emailMatch.name && args.name) updates.name = args.name;
                await ctx.db.patch(emailMatch._id, updates);
                return emailMatch;
            }
        }

        // Determine role. If it's the first user, make them admin. 
        // Otherwise user.
        const allUsers = await ctx.db.query("users").take(1);
        const role = allUsers.length === 0 ? "admin" : "user";

        const newId = await ctx.db.insert("users", {
            id: args.id,
            githubId: args.githubId,
            name: args.name,
            email: args.email,
            image: args.image,
            role,
        });

        return await ctx.db.get(newId);
    },
});

export const getProfileDetails = query({
    args: { id: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("id", args.id))
            .first();

        if (!user) return null;

        // Fetch user's graph count
        const graphs = await ctx.db
            .query("graphs")
            .withIndex("by_user", (q) => q.eq("userId", user.id))
            .collect();

        return {
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            githubId: user.githubId,
            hasPassword: !!user.password,
            createdAt: user._creationTime,
            graphCount: graphs.length,
        };
    },
});

export const getUserRole = query({
    args: { id: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("id", args.id))
            .first();
        return user?.role || "user";
    },
});

export const getUserByEmail = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
    },
});

export const createUserCredentials = mutation({
    args: {
        id: v.string(),
        name: v.string(),
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (existing) {
            throw new Error("Email already in use");
        }

        const allUsers = await ctx.db.query("users").take(1);
        const role = allUsers.length === 0 ? "admin" : "user";

        const newId = await ctx.db.insert("users", {
            id: args.id,
            name: args.name,
            email: args.email,
            password: args.password,
            role,
        });

        return await ctx.db.get(newId);
    },
});
