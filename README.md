``Under development``
# pulse
The ultimate personal slackbot for 404Navdeep. Runs on NodeJS and Slack/Bolt!


What we have added so far:
`afk` - Adds a afk status to yourself and replies to every message in thread/dm/group-dm/ping with an ephemeral message
`/underthedms` - Adds a custom status for when you have too many dms. It replies to every DM with a direct dm or ephemeral fist!
`/join-404pc` Added! It adds to my persona channel and gives you an option to add yourself to a ping group called 404ers to get pinged more frequently!
Also It works by first taking a form from yu asking why you want to join and then your applicatin sent to the owner of the channel and then the person reviws your reason. He gets 2 buttons `Approve` &  `Deny`. Approve send adds you and sends a message to the channel and you about getting acepted! Deny sends you a dm saying you have been denied. Therre is no reason for decisions(prayge who cares)

Planned Commands
`joinpc` - Should open a application form to join my channel!
`Todays Stats` - Get my github & hackatime & slack stats and ask for what task i made for today and what for tommrow and then save them in a db.
`AI` - Use an api of ai.dwait.dev. for free claude but now that I think of it will be divided into 2 parts:
1. The main AI command:
> responds with GPT-5.5 Mini as it costs less and isnt stupid! + Use my ai.hackclub.com daily limit.
2.  Summarizing events: It will be free model that we send requests to for every Campus Manager, Google Classroom Announcements, Whatsapp group messages and simplify it into 1-2 lines or more if its important! 
`The only Integration you need`:
I'll be adding notion and its api/MCP to make it work. Which is going to be exiting. I can make it add things in tasks and events in calender and stufff really cooll!.



## .env Example:
```
SLACK_USER_TOKEN=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
OWNER_ID=
S404ERS_GID=
```