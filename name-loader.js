module.exports = function (source, map) {
  this.callback(
    null,
    `export default function (Component) {
      Component.name = ${
      JSON.stringify(source)
    }
    }`,
    map
  );
};
