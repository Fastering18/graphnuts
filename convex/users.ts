import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncUser = mutation({
    args: {
        id: v.string(),
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
            // Update info if changed
            if (existing.name !== args.name || existing.image !== args.image) {
                await ctx.db.patch(existing._id, {
                    name: args.name,
                    image: args.image,
                });
            }
            return existing;
        }

        // Determine role. If it's the first user, make them admin. 
        // Otherwise user.
        const allUsers = await ctx.db.query("users").take(1);
        const role = allUsers.length === 0 ? "admin" : "user";

        const newId = await ctx.db.insert("users", {
            id: args.id,
            name: args.name,
            email: args.email,
            image: args.image,
            role,
        });

        return await ctx.db.get(newId);
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
