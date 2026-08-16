export default class CommandManager {
    constructor() {
        this.commands = new Map();
    }

    register(command) {
        if (!command.name) {
            throw new Error("Command must have a name");
        }
        if (this.commands.has(command.name)){
            throw new Error(
                `Command alr registered: /${command.name}`
            );
        }
        this.commands.set(command.name, command);
    }

    get(name) {
        return this.commands.get(name);
    }

    list() {
        return [...this.commands.values()];
    }

    async execute(name, payload) {
        const command =
            this.get(name);
        
            if (!command) {
                throw new Error(
                    `Unkown command: ${name}`
                );
            }
            const {ctx} = payload;

            if(command.ownerOnly &&
                payload.command.user_id !==
                    ctx.state.get("afk.userId")
            ) {
                await payload.ack();
                await payload.respond({
                    response_type: "ephemeral",
                    text: "You dont have permission to use this command."
                });
                return;
            }
            return command.execute(payload);
    }
}