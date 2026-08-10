import { createSlack } from "./slack.js"
import CommandManager from "./command-manager"
import PluginManager from "./plugin-manager.js"
import state from "./state.js"
import events from "./event-bus.js"
import logger from "./logger.js"

export async function createApp() {
    const slack = await createSlack();
    const commands = new CommandManager();

    const ctx = {
        slack,
        commands,
        state,
        events,
        logger
    };

    const plugins = new PluginManager(ctx);

    ctx.plugins = plugins;

    return {
        slack,
        ctx,
        plugins,

        async start() {
            await plugins.loadAll();
            for (const command of commands.list()) {
                slack.command(
                    `/${command.name}`,
                    async (payload) => {
                        try {
                            await command.execute({
                                ...payload,
                                ctx
                            });
                        } catch (error) {
                            logger.error(
                                {
                                    command: command.name,
                                    error
                                },
                                "Command Failed"
                            );
                        }
                    }
                );
            }

            
            await slack.start();
            logger.info("Pulse is ready");
        }
    }
}