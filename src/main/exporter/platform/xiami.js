const Sequelize = require("sequelize");
const { QueryTypes } = require("sequelize");
const fs = require("fs");
const isWindows = process.platform == "win32";
const userName = require("os").userInfo().username;
const ini = require("ini");
const sqlite3 = require("sqlite3");

console.log("userName", userName);

const os = require("os");
console.log("userName", userName);
const homeDir = os.homedir() || `C:\\Users\\${userName}`;

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

class Xiami {
  constructor() {
    this.type = "xiami";
    this.name = "虾米音乐";
    this.existsFiles = [];
  }

  isExists() {
    let files = [];
    if (isWindows) {
      files.push([
        `${homeDir}\\AppData\\Roaming\\Xiami\\xiami_info.ini`,
        `${homeDir}\\AppData\\Roaming\\Xiami\\Xiami.db`,
      ]);
    } else {
      //   files.push(
      //     `/Users/${userName}/Library/Containers/com.netease.163music/Data/Documents/storage/sqlite_storage.sqlite3`
      //   );
    }
    const existsFiles = files.filter((_) => {
      if (typeof _ == "string") {
        return fs.existsSync(_);
      } else {
        return _.filter((p) => fs.existsSync(p)).length == _.length;
      }
    });
    console.log("existsFiles", existsFiles);
    if (existsFiles.length == 0) {
      return null;
    }
    this.existsFiles = existsFiles;
    return {
      existsFiles: existsFiles[0],
      type: this.type,
      name: this.name,
    };
  }

  getCollectIds(xiamiConfigDatabase) {
    xiamiConfigDatabase = xiamiConfigDatabase || this.existsFiles[0][0];
    console.log("xiamiConfigDatabase", xiamiConfigDatabase);
    const configStr = fs.readFileSync(xiamiConfigDatabase, "utf-8");
    const config = ini.parse(configStr);
    const userId = config.xiami.USER_ID;
    const mapping = config.xiami[userId];
    const key = `${userId} = ${mapping};`;
    const lines = configStr.split("\n").filter((_) => _.indexOf(key) > -1);
    if (lines.length) {
      const songIds = lines[0]
        .replace(key, "")
        .split(",")
        .map((_) => _.trim())
        .filter((_) => !isNaN(parseInt(_)));
      return songIds;
    }
    return [];
  }

  async export(xiamiDatabase) {
    xiamiDatabase = xiamiDatabase || this.existsFiles[0][1];
    const sequelize = new Sequelize("main", null, null, {
      dialect: "sqlite",
      logging: false,
      storage: xiamiDatabase,
      dialectOptions: {
        // mode: sqlite3.OPEN_READONLY
      },
    });
    await sequelize.authenticate();
    console.log("Connection has been established successfully.");
    const songIds = this.getCollectIds();
    console.log("found song", songIds.length);
    // fs.writeFileSync("ids.json", JSON.stringify(songIds, null, 2));
    const songRows = await sequelize.query(
      "select * from song_info where song_id in (" + songIds.join(",") + ")",
      { type: QueryTypes.SELECT }
    );

    const PlaylistItem = sequelize.define(
      "list_items",
      {
        item_id: Sequelize.STRING,
        item_type: Sequelize.INTEGER,
        list_id: Sequelize.STRING,
        list_type: Sequelize.INTEGER,
      },
      {
        freezeTableName: true,
        timestamps: false,
      }
    );
    PlaylistItem.removeAttribute("id");
    if (songRows.length < songIds.length) {
      const stepItems = chunk(songIds, 300);
      try {
        await PlaylistItem.sync({ alter: true });
        await PlaylistItem.destroy({
          where: {},
          truncate: true,
        });
      } catch (e) {
        console.log(e);
      }
      for (let index = 0; index < stepItems.length; index++) {
        const newIds = stepItems[index];
        console.log("insert", newIds.length);
        try {
          await PlaylistItem.bulkCreate(
            newIds.map((_) => {
              return {
                item_id: _,
                item_type: 1,
                list_id: "main",
                list_type: 1,
              };
            }),
            { ignoreDuplicates: true }
          );
        } catch (e) {
          console.log(e);
        }
      }
      console.log("not found info");
      throw Error("请重启虾米音乐，直到能点开【当前播放列表】后再尝试导入");
    }

    const orderedSongs = songIds
      .map((_) => {
        return songRows.filter((p) => p.song_id == _)[0];
      })
      .filter((_) => _);

    const formattedSongs = orderedSongs.map((_) => {
      return {
        type: "xiami",
        song_id: _.song_id,
        song_name: _.song_name,
        album_name: _.album_name,
        artist_name: _.singers,
        album_logo: _.album_logo,
        artist_logo: _.artistLogo,
      };
    });
    return formattedSongs;
  }
}

export default Xiami;

// (async () => {
//   const nete = new Xiami();
//   const has = nete.isExists();
//   if (has) {
//     const results = await nete.export();
//     console.log("results", results.length);
//   }
// })();
