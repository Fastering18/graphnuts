import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        id: v.string(), // Syncs with Github ID or NextAuth ID
        githubId: v.optional(v.string()), // Used for Account Linking
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        password: v.optional(v.string()),
        image: v.optional(v.string()),
        role: v.union(v.literal("admin"), v.literal("user")),
    }).index("by_token", ["id"])
        .index("by_email", ["email"])
        .index("by_github", ["githubId"]),

    graphs: defineTable({
        userId: v.optional(v.string()), // The NextAuth User ID of the owner
        title: v.string(),
        dotSource: v.string(),
        isPublic: v.boolean(),
        isPublicEditable: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),
});
