import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

export default class PluginManager {
    constructor(ctx) {
        this.ctx = ctx;
        this.plugins = new Map();
    }

    async loadAll() {
        const pluginDir = path.resolve("plugins");

        const entires = await fs.readdir(pluginDir, {
            withFileTypes: true
        });

        for (const entry of entires) {
            if (!entry.isDirectory()) {
                continue;
            }
            const pluginPath = path.join(
                pluginDir,
                entry.name,
                "main.js"
            );
            
            try {
                const module = await import(
                    pathToFileURL(pluginPath).href
                );

                const plugin = module.default;

                if(!plugin?.id) {
                    throw new Error(
                        "Plugin is missing an id"
                    );
                }

                if(this.plugins.has(plugin.id)) {
                    throw new Error(
                        `Duplicate plugin: ${plugin.id}`
                    );
                }
                await plugin.init(this.ctx);
                this.plugins.set(plugin.id, plugin);
                this.ctx.logger.info(
                    `Loaded pludin: ${plugin.id}`
                );
            } catch (error) {
                this.ctx.logger.error(
                    {
                        plugin: entry.name,
                        error: {
                            message: error.message,
                            stack: error.stack,
                            name: error.name
                        }
                    },
                    "Failed to load plugin"
                );
            }
        }
    }
    get(id) {
        return this.plugins.get(id);
    }
    list() {
        return [...this.plugins.values()];
    }
}