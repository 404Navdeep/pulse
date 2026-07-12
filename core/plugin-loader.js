import fs from "fs/promises";
import path from "path";
import logger from "./logger.js"
import { pathToFileURL } from "url";

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

            const pluginURL = pathToFileURL(pluginPath).href;
            
            const plugin = (await import(pluginURL)).default;

            await plugin.init(ctx);
            
            logger.info(`Loaded ${plugin.id}`);
        } catch (err) {
            logger.error(err);
        }
        
    }
}