import fs from "fs/promises";
import path from "path";
import logger from "./logger.js"

const PLUGIN_DIR = "./plugins";

export async function loadPlugins(ctx) {
    logger.info("Getting Plugins");

    const folders = await fs.readdir(PLUGIN_DIR);

    for (const folder of folders) {
        try {
            const pluginPath = path.resolve(
                PLUGIN_DIR,
                folder,
                "index.js"
            );
            const plugin = (await import(pluginPath)).default;

            await plugin.init(ctx);
            
            logger.info(`Loaded ${plugin.id}`);
        } catch (err) {
            logger.error(err);
        }
        
    }
}