// voor de oude tests: het projectmap-venster meteen met "Zonder projectmap" sluiten
module.exports = () => {
  const kijk = () => { const d = document.getElementById('projectMapDialoog'); if (d && d.open) document.getElementById('pmZonder')?.click(); };
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(kijk).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open'] }));
};
