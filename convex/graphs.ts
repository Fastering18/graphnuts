import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getGraphs = query({
    args: { userId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.userId) return [];
        return await ctx.db
            .query("graphs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});

export const getGraph = query({
    args: { id: v.id("graphs") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

export const saveGraph = mutation({
    args: {
        id: v.optional(v.id("graphs")),
        userId: v.optional(v.string()),
        title: v.string(),
        dotSource: v.string(),
        isPublic: v.boolean(),
        isPublicEditable: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        if (args.id) {
            // Update existing
            const existing = await ctx.db.get(args.id);
            if (!existing) throw new Error("Graph not found");

            if (existing.userId && existing.userId !== args.userId) {
                if (!existing.isPublicEditable) {
                    throw new Error("Unauthorized to edit this graph");
                }
            }

            await ctx.db.patch(args.id, {
                title: args.title,
                dotSource: args.dotSource,
                isPublic: args.isPublic,
                isPublicEditable: args.isPublicEditable !== undefined ? args.isPublicEditable : existing.isPublicEditable,
            });
            return args.id;
        } else {
            // Create new
            return await ctx.db.insert("graphs", {
                userId: args.userId,
                title: args.title,
                dotSource: args.dotSource,
                isPublic: args.isPublic,
                isPublicEditable: args.isPublicEditable ?? true,
            });
        }
    },
});

export const deleteGraph = mutation({
    args: { id: v.id("graphs") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});
