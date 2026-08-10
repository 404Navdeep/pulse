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
}