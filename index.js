// Logs a messenger chat to a file. Please use login.js to save login cookies to disk first.
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const login = require('facebook-chat-api');
const async = require('async');
const log = require('npmlog');
const download = require('download');
const fileType = require("file-type");

// Grabbing 5k messages at a time seems to be stable enough.
// If the script crashes with 500 errors or with Facebook complaining you can
// try lowering this number.
const defaultInterval = 5000;
const argv = require('yargs')
    .options({
        // TODO: Add fancy login logic instead of using another script (login.js)
        // 'username': {
        //     alias: 'u',
        //     describe: 'Facebook account email or phone number',
        //     demandOption: true
        // },
        // 'password': {
        //     alias: 'p',
        //     describe: 'Password\n' +
        //     '(Multi-factor authentication is not supported at the moment)',
        //     demandOption: true
        // },
        'target': {
            alias: 't',
            describe: 'ID of the conversation you would like to log.\n' +
            'If you are logging a group, use the number at the end of the messenger.com URL when the chat is open ' +
            '(example: 123456 for https://www.messenger.com/t/123456).\n' +
            'If you are logging a conversation with another user, you can use their Facebook user ID number or you can ' +
            'input their full name and this tool will choose the user whom (according to Facebook) you are most likely ' +
            'referring to.',
            demandOption: true
        },
        'interval': {
            alias: 'i',
            describe: 'The maximum number of messages to request from Messenger each iteration. If you are getting ' +
            '500 errors, try lowering this number from the default.',
            default: defaultInterval,
            minimum: 10, // I think some logic would mess up if this was equal to 1
            demandOption: false
        }
    })
    // .example('$0 -u="my.email@example.com" -p="letmein" -t="Ben Franklin', "Export chat logs with Ben Franklin")
    .help()
    .argv;

const id = argv.target;
const interval = argv.interval;
log.info("Using interval of " + interval);

function getAndStoreHistory(api, conversationID) {
    let i = 0;
    let total = 0;
    let lastId = '';
    let running = true;
    let lastTimestamp = null;
    async.whilst(
        () => {
            return running;
        },
        (callback) => {
            api.getThreadHistory(conversationID, interval, lastTimestamp, (error, history) => {
                if (error) {
                    running = false;
                    callback(error);
                    return;
                } else if (history.length <= 0) {
                    running = false;
                    callback('No messages returned from Messenger; something is amiss!');
                    return;
                }
                // messenger returns interval+1 messages if there are more total messages than the interval,
                // so we cut off the last message (which we already have). However, if we have less than the
                // interval number of messages, then we shouldn't cut off the last one. This handles this logic for us.
                let truncatedHistory = history; // TODO: fix this messy stopgap logic
                if (lastTimestamp) {
                    truncatedHistory = history.slice(0, interval);
                }
                if (lastTimestamp && truncatedHistory.length < interval) {
                    // Remove the last element if we have obtained less than we expected
                    truncatedHistory = truncatedHistory.slice(0, truncatedHistory.length - 1);
                }
                if (truncatedHistory.length <= 0 || lastId === truncatedHistory[0].messageID) {
                    running = false;
                    log.info('Seems like we have reached the top of the message history; exiting');
                    callback();
                    return;
                }
                lastTimestamp = truncatedHistory[0].timestamp;
                lastId = truncatedHistory[0].messageID;
                total += truncatedHistory.length;

                // Resolve attachment URLs and download attachments
                async.waterfall([
                    (wCallback) => {
                        async.map(
                            truncatedHistory,
                            (message, outerOuterCb) => {
                                async.map(
                                    message.attachments,
                                    (attachment, outerCb) => {
                                        async.waterfall([
                                            (callback) => {
                                                switch (attachment.type) {
                                                    case 'animated_image':
                                                        let id = attachment.name.split('-')[1];
                                                        api.resolvePhotoUrl(id, (err, u) => {
                                                            callback(null, 'gif-' + id, u)
                                                        });
                                                        break;
                                                    case 'photo':
                                                        api.resolvePhotoUrl(attachment.ID, (err, u) => {
                                                            callback(null, 'photo-' + attachment.ID, u)
                                                        });
                                                        break;
                                                    case 'sticker':
                                                        callback(null, 'sticker-' + attachment.stickerID, attachment.url);
                                                        break;
                                                    case 'share':
                                                        if (attachment.image === null) {
                                                            callback(null, null, null);
                                                        } else {
                                                            callback(null, 'share-' + attachment.ID, attachment.image);
                                                        }
                                                        break;
                                                    case 'error':
                                                        callback();
                                                        break;
                                                    case 'video':
                                                        callback(null, attachment.filename, attachment.url);
                                                        break;
                                                    default:
                                                        callback(null, attachment.name, attachment.url);
                                                }
                                            },
                                            (name, url) => {
                                                attachment.fileName = name;
                                                attachment.fileUrl = url;
                                                outerCb();
                                            }
                                        ]);
                                    },
                                    (err) => {
                                        outerOuterCb();
                                    }
                                )
                            },
                            (err) => {
                                wCallback();
                            }
                        );
                    },
                    () => {
                        mkdirp(outputDirectory, (err) => {
                            if (err) {
                                log.error('Something went wrong trying to create the directory to log the messages.');
                                log.error(err);
                            } else {
                                // Because Messenger gives us messages that are newest first, the JSON output files with larger number filenames
                                // actually contain older messages. When using these files chronologically, remember to use the largest numbered files first.
                                fs.writeFile(path.join(outputDirectory, i.toString() + '.json'), JSON.stringify(truncatedHistory), {}, (err) => {
                                    if (err) log.error(err);
                                    log.info('Got ' + truncatedHistory.length + ' messages; running total: ' + total);
                                    i++;
                                    callback(null);
                                });
                            }
                        });

                        // Download attachments
                        mkdirp(attachDirectory, (err) => {
                            if (err) {
                                log.error('Something went wrong trying to create the directory to download attachments.');
                                log.error(err);
                            } else {
                                log.verbose('Downloading attachment');
                                for (let mIdx = 0; mIdx < truncatedHistory.length; mIdx++) {
                                    for (let aIdx = 0; aIdx < truncatedHistory[mIdx].attachments.length; aIdx++) {
                                        let attachment = truncatedHistory[mIdx].attachments[aIdx];
                                        let name = attachment.fileName;
                                        let u = attachment.fileUrl;
                                        if (attachment.type === 'error' || (u === null && attachment.type === 'share')) {
                                            log.verbose('This attachment was a "share" and had no image; continuing...')
                                        } else {
                                            let destination = path.join(attachDirectory, name);

                                            download(u).then(data => {
                                                let ft = fileType(data);
                                                if (ft && ft.ext) destination += '.' + ft.ext;

                                                fs.writeFile(destination, data, () => {
                                                    log.verbose('Attachment downloaded to ' + destination);
                                                });
                                            });
                                        }
                                    }
                                }
                            }
                        });
                    }
                ]);
            });
        },
        (err) => {
            if (err) log.error(err);
            log.info('Total messages exported: ' + total);
            log.info('Messages exported to: ' + outputDirectory);
        }
    );
}

const outputDirectory = path.join('./output', id.toString());
const attachDirectory = path.join(outputDirectory, 'attachments');
fs.readFile('appstate.json', 'utf8', {}, (error, appState) => {
    if (error) {
        log.error(error);
        log.error('Did you forget to run login.js first?');
        return;
    }

    login({appState: JSON.parse(appState)}, {logLevel: 'info'}, (err, api) => {
        if (err) return log.error(err);

        if (isNaN(parseInt(id))) {
            // Not a number; probably a user's name
            api.getUserID(id, (err, users) => {
                if (err) log.error(err);
                else if (users.length < 1) {
                    log.error('No users found that match the name: "' + id + '"');
                } else {
                    let userID = users[0].userID;
                    log.info('Exporting log with user ' + users[0].name + ' (user ID ' + userID + ')');
                    getAndStoreHistory(api, userID);
                }
            });
        } else {
            log.info('Exporting conversation with group/user ID ' + id);
            getAndStoreHistory(api, id);
        }
    });
});
