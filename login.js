// Run this first!
// Simple helper script that saves login details to a file so that you aren't
// constantly logging in and out of Facebook (which causes issues).
const fs = require("fs");
const login = require("facebook-chat-api");
const readlineSync = require("readline-sync");
const log = require("npmlog");

let email, pw;
email = readlineSync.question('Email: ', {hideEchoBack: false});
pw = readlineSync.question('Password: ', {hideEchoBack: true});

login({email: email, password: pw}, {forceLogin: true}, (err, api) => {

    if(err) {
        log.error(err);
        return;
    }

    fs.writeFile('appstate.json', JSON.stringify(api.getAppState()), {}, (error) => {
        if (error) {
            log.error('Error while saving authentication file!');
            log.error(error);
        } else {
            log.info('Login details saved.');
        }
    });
});