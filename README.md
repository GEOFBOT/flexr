# Flexr: **F**acebook Messenger **L**og **Ex**porte**r**

Logs Facebook Messenger chat logs to json files, which can be rendered to a readable HTML.

![Sample screenshot](https://cloud.githubusercontent.com/assets/5053772/25557407/87840b04-2cde-11e7-9110-8d4a41216e4a.png)

## Usage
1. Install all the dependencies with `npm install`.

2. Run `node login.js` and enter your username and password.
This should sign you into Messenger so that we can download logs.
The `appstate.json` file that is created stores your authentication credentials, so be sure to delete that file securely when you're done.

3. Run `index.js`, like this: `node index.js -t "[Person name or group ID]"`.
This will download your chat logs and attachments into a folder under `output/`.

4. Finally, run `render.js`, like this: `node render.js -t "[Person name or group ID]"`.
This will render your downloaded chat logs into a readable HTML file.

5. If you want to send your downloaded logs to someone, be sure to zip the entire output subfolder, so that attachments and log CSS are included.
