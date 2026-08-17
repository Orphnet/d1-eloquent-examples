import { Hono } from "hono";
import { Attachment, Post, Task } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const attachmentRoutes = new Hono<AppEnv>();

/**
 * Upload an attachment for a Task or Post. The BLOB body is read from the
 * raw request body; metadata (filename, mime, attachable_type/id, uploader_id)
 * arrives as JSON in custom headers to keep the example simple.
 */
attachmentRoutes.post("/", async (c) => {
    const meta = {
        attachable_type: c.req.header("x-attachable-type") as "task" | "post" | undefined,
        attachable_id: c.req.header("x-attachable-id"),
        uploader_id: c.req.header("x-uploader-id"),
        filename: c.req.header("x-filename") ?? "upload.bin",
        mime_type: c.req.header("content-type") ?? "application/octet-stream",
    };

    if (!meta.attachable_type || !meta.attachable_id || !meta.uploader_id) {
        return fail(c, "validation", "x-attachable-type, x-attachable-id, x-uploader-id headers required", 422);
    }

    const subject =
        meta.attachable_type === "task"
            ? await Task.find(meta.attachable_id)
            : await Post.find(meta.attachable_id);
    if (!subject) return notFound(c, meta.attachable_type);

    const buf = await c.req.arrayBuffer();
    if (buf.byteLength === 0) return fail(c, "validation", "empty body", 422);

    const att = await Attachment.create({
        id: crypto.randomUUID(),
        uploader_id: meta.uploader_id,
        attachable_type: meta.attachable_type,
        attachable_id: meta.attachable_id,
        filename: meta.filename,
        mime_type: meta.mime_type,
        size_bytes: buf.byteLength,
        data: buf,
    });

    return ok(c, att.toObject(), 201); // toObject excludes `data` (it's in `hidden`)
});

/** Download an attachment by id — streams the raw BLOB. */
attachmentRoutes.get("/:id/download", async (c) => {
    const att = await Attachment.find(c.req.param("id"));
    if (!att) return notFound(c, "attachment");

    const data = att.get("data");
    return new Response(data, {
        status: 200,
        headers: {
            "content-type": att.get("mime_type"),
            "content-disposition": `attachment; filename="${att.get("filename")}"`,
            "content-length": String(att.get("size_bytes")),
        },
    });
});
