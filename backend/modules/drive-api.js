module.exports = function createDriveApi(app) {
  app.post('/api/drive/connect', (req, res) => { res.json({ success: true, message: 'Google Drive conectado con éxito.' }); });
  app.get('/api/drive/files', (req, res) => {
    res.json({
      files: [
        { name: 'Hermes_Backup_2026.zip', size: '15.4 KB', type: 'zip', modified: 'Hoy, 10:24 AM' },
        { name: 'Leads_Puente_Alto.csv', size: '1.2 MB', type: 'csv', modified: 'Ayer, 05:42 PM' },
        { name: 'Colab_Hermes_Node.ipynb', size: '42.8 KB', type: 'ipynb', modified: '18 Jun 2026' },
        { name: 'Configuracion_Cluster.yaml', size: '2.1 KB', type: 'yaml', modified: '12 Jun 2026' }
      ]
    });
  });
};
