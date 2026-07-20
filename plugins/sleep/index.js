export default {
    id: "sleep",

    async init(ctx) {
        ctx.state.set("sleep", {
            enabled: false,
            reason: "",
            since: null,
            repliedUsers: {}
        });

        ctx.logger.info("Sleep plugin on");
    },

    async stop(ctx) {
        ctx.logger.info("Sleep plugin off");
    }
};