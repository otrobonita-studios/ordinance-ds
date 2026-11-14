/* The two examples on the page Data: a block of data that fits its schema, and a block that does not. */
(function () {
  'use strict';
  var schema = { type: 'object', props: { rows: { type: 'array', max: 20, items: { type: 'object', props: {
    name: { type: 'string', max: 40 }, pages: { type: 'number', min: 0, max: 1000 } } } } } };
  var box = document.getElementById('demo-out');
  var note = document.getElementById('demo-refused');
  try {
    var good = ordData.read('demo-data', schema);
    ordData.table(box, { caption: 'Pages of each plugin, from the data block', columns: [{ key: 'name', label: 'Plugin' }, { key: 'pages', label: 'Pages', numeric: true }], rows: good.rows });
  } catch (err) {
    box.textContent = 'Error: the data was refused. ' + err.message;
  }
  try {
    ordData.read('demo-wrong', schema);
    note.textContent = 'The second block was accepted. That is an error in the example.';
  } catch (err) {
    note.setAttribute('data-tone', 'harm');
    note.textContent = 'Error: the data was refused. ' + err.message + '.';
  }
})();
