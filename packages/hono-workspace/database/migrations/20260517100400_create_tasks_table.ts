import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100400_create_tasks_table",
    description: "Tasks belong to a project. parent_id is a self-referencing FK for subtasks.",

    up: (schema: Schema) => {
        schema.createTable("tasks", (t) => {
            t.id();
            t.text("project_id").notNull().references("projects", "id").onDelete("cascade");
            t.text("parent_id").references("tasks", "id").onDelete("cascade");
            t.text("assignee_id").references("users", "id").onDelete("set null");
            t.text("title").notNull();
            t.text("description");
            t.text("status").notNull().default("open");
            t.integer("priority").notNull().default(0);
            t.real("estimated_hours");
            t.text("due_at");
            t.text("completed_at");
            t.softDeletes();
            t.timestamps();

            t.check("status IN ('open', 'in_progress', 'done', 'cancelled')");
            t.index("project_id, status");
            t.index("assignee_id");
            t.index("parent_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("tasks");
    },
};

export default migration;
