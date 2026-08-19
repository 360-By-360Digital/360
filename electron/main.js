const { app, BrowserWindow, shell, Menu } = require('electron');

const BASE_URL = 'https://360-search.com';
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: '360',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    backgroundColor: '#050816',
    show: false,
  });

  win.loadURL(BASE_URL);
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '360',
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Home',  accelerator: 'CmdOrCtrl+Home',       click: () => win.loadURL(BASE_URL) },
        { label: 'Chat',  accelerator: 'CmdOrCtrl+Shift+C',    click: () => win.loadURL(BASE_URL + '/chat') },
        { label: 'Mail',  accelerator: 'CmdOrCtrl+Shift+M',    click: () => win.loadURL(BASE_URL + '/360mail') },
        { label: 'Maps',  accelerator: 'CmdOrCtrl+Shift+P',    click: () => win.loadURL(BASE_URL + '/apps/360Maps') },
        { label: 'News',  accelerator: 'CmdOrCtrl+Shift+N',    click: () => win.loadURL(BASE_URL + '/news') },
        { label: 'Music', accelerator: 'CmdOrCtrl+Shift+U',    click: () => win.loadURL(BASE_URL + '/apps/360Music') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
