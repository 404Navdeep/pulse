export function homeView() {
    return{
        type: "home",
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "Pulse"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: enabled
                    ? "AFK ON"
                    : "AFK OFF"
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type:"button",
                        text: {
                            type: "plain_text",
                            text: enabled
                                ? "Back from AFK"
                                : "Going AFK"
                        },
                        style: enabled
                            ? "danger"
                            : "primary",
                        action_id: "sleep_toggle"
                    }
                ]
            }
        ]
    };
}