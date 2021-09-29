import Dayjs from "dayjs";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
import mustache from "mustache";
import path from "path";
import relativeTime from "dayjs/plugin/relativeTime.js";

Dayjs.extend(isSameOrBefore);
Dayjs.extend(relativeTime);

const DIST = "dist";

export const getSchedule = async () => {
  const URL = "https://www.tsn.ca/2021-formula-one-racing-on-tsn-1.431562?tsn-amp";

  console.log("Downloading HTML...");

  const dom = await JSDOM.fromURL(URL);

  console.log("Got HTML. Parsing document...");

  const document = dom.window.document;

  const statsTable = document.querySelector("div.stats-table table tbody + tbody");

  if (!statsTable) {
    throw new Error("Unable to find race table");
  }

  const rows = statsTable.querySelectorAll("tr");

  if (rows.length === 0) {
    throw new Error("No rows found in race table");
  }

  /**
   * [{
   *    city: string;
   *    events: [{
   *      name: string;
   *      date: string;
   *      time: string;
   *      network: string;
   *    }]
   * }]
   */
  const races = [];

  let race = null;

  for (let row of rows) {
    const columns = row.querySelectorAll("td");

    if (columns.length !== 4) {
      throw new Error(`Unexpected number of columns. Expected ${4}. Got ${columns.length}`);
    }

    const [col1, col2, col3, col4] = columns;

    // First row
    if (col1.textContent.trim() === "") {
      if (race !== null) {
        races.push(race);
      }

      const city = col2.textContent;

      race = {
        city,
        events: [],
      };
    } else {
      const name = col1.textContent;
      const date = col2.textContent;
      const time = col3.textContent;
      const network = col4.textContent;

      if (race === null) {
        throw new Error("Race object is null");
      }

      race.events.push({
        name,
        date,
        time,
        network,
      });
    }
  }

  console.log("Found", races.length, "races");

  return races;
};

const renderWebpage = async (races, nextRaceWeekend) => {
  console.log("Loading webpage template");

  const template = await fs.readFile("./template.mustache", { encoding: "utf-8" });

  const webpage = mustache.render(template, { races, nextRaceWeekend });

  console.log("Writing files");

  if (!(await pathExists(DIST))) {
    fs.mkdir(DIST);
  }

  await fs.writeFile(path.join(DIST, "index.html"), webpage, { encoding: "utf-8" });

  await fs.writeFile(path.join(DIST, "races.json"), JSON.stringify(races, null, 2), { encoding: "utf-8" });

  console.log("Done.");
};

(async () => {
  const races = await getSchedule();

  const now = Dayjs();

  // Filter out the races that have already happened.
  // TODO: don't hardcode year
  const nextRaces = races.filter((race) =>
    race.events.some((event) => now.isSameOrBefore(`${event.date} 2021`, "day"))
  );

  let nextRaceWeekend = null;

  if (nextRaces.length) {
    const nextDate = nextRaces[0].events[0].date;
    nextRaceWeekend = Dayjs(`${nextDate} 2021`).fromNow();
  }

  console.log(nextRaces.length, "races left");
  console.log("Next race", nextRaceWeekend);

  await renderWebpage(nextRaces, nextRaceWeekend);
})();

const pathExists = async (path) => {
  try {
    await fs.stat(path);
    return true;
  } catch (e) {
    return false;
  }
};
