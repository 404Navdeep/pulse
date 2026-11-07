# Pulse!
### A personal slack bot for me!
I made this as a continuition to my old personal slack bots (Paaji and Paaji-V2)

---
## Features / Plugins

### AFK
Set myself as afk with a reason and also autoreplies to any messages

### Ask
Ack general questions to qwen3-32b with context of the thread

### Games
Play games like !8ball, !coinflip and !roast/!complement just for fun!

### Git - Notifs
Gives notifs of recent pushes and commits in my personal channel

### Hackatime - Notifs
Sends notifications to my personal channel whenever I start coding, do 1hr more o a project or do 1hr more on a specific language! 

### Join 404PC
Simple slash command to join my personal channel with application style entry! (U'll be accpted dw)

### Ping
Check the latency of pulse's response
### Purge
Delet the bots messages, in specific channels. Use -threads to delete thread messages too

### Remind Me
A slach command that works like slack reminders but dm's me instead and probably has more chances of missing it

### Track Shipment
`/p-track [courier] <tracking id> [label]` to start tracking a parcel (courier can be left out for India Post IDs), `/p-track list` to see them all and `/p-track remove <id>` to stop. Checks every 30 min and posts a Block Kit update in my personal channel whenever something changes. Uses trackcourier.io first (25 free shipments, re-checks are free) and falls back to 17TRACK's free trial when those run out; if both are full, new IDs wait in a queue.

### Under The DMs
Respond to all the dms with a message stating that you are under the dms a.k.a. Flooded with dms

### Weather
Get Srinagars weather which is pretty gud always!

## Use case
I will prob just use it because its mine not because its cool but the plugin system makes it pretty easy to expand and make it like large with big commands.

## Planned features 

### Campus manager Support
Add my schools mailing systems support to get notifications

### Google Classroom Support
Get sumarized announcements from each of my teachers.

### Spotify now playing
Show what I am playing and how much long my sessions last synced real time!
(Needs web api which i will find a work around)

### Daily recap
I want it to day the days stats, like:
- Commits
- Hours/project
- Messages sent
- Emails recieved
- Todo List and plans for tomorow

## Example .env
```.env
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_USER_TOKEN=
OWNER_ID=
S404ERS_GID=
S404PC_CID=
GITHUB_USERNAME=
HAT_U=
HACKATIME_API_KEY=
AI_MODEL=
OPENAI_KEY=
AI_URL=
GITHUB_TOKEN=
TRACKCOURIER_API_KEY=
TRACK17_API_KEY=
```
## Conclusion
Thats pulse till now! Checkout in my personal channel!
PS: Use /join-404pc to join!