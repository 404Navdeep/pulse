import { version } from "react";

export default {
    id: "afk",
    name: "AFK"
    version: "1.0.0",

    async init(ctx) {
        ctx.state.set("afk", {
            enabled: false,
            reason: null,
            since: null
        });

        ctx.commands.register({
            name: "afk",
            description: "Set yourself as AFK",

            async
        })
    }
}