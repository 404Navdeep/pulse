export default {
    id: "sleep",

    async init(ctx) {
        ctx.logger.info("Sleep plugin on");

        ctx.events.onEvent("app.ready", () => {
            ctx.logger.info("Sleep plugin using app.ready")
        })
    },

    async stop(ctx) {
        ctx.logger.info("Sleep plugin off");
    }
};