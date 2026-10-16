/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("no_conformitats");

    const existing = collection.fields.getByName("videos");
    if (existing) return;

    collection.fields.add(
      new FileField({
        name: "videos",
        maxSelect: 5,
        maxSize: 104857600, // 100 MB per video
        mimeTypes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"],
      })
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("no_conformitats");
      collection.fields.removeByName("videos");
      app.save(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  }
);
