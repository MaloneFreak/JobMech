// JobMech 2 - main window: hosts the UI in WebView2 and answers its requests.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JobMech
{
    sealed class MainForm : Form
    {
        private readonly WebView2 web;
        private CoreWebView2Environment env;
        private readonly Services services;
        private bool printing;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        public MainForm()
        {
            Text = "JobMech";
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("JobMech.ico"))
                {
                    if (s != null) Icon = new Icon(s);
                }
            }
            catch { }

            services = new Services(this);

            bool dark = services.ReadWindowState().Dark;
            BackColor = dark ? Color.FromArgb(0x12, 0x13, 0x15) : Color.FromArgb(0xF5, 0xF3, 0xEE);
            StartPosition = FormStartPosition.Manual;
            RestorePlacement();

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BackColor;
            Controls.Add(web);

            Load += OnLoad;
            FormClosing += delegate { SavePlacement(); };
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyCaptionTheme(services.ReadWindowState().Dark, BackColor, Color.Empty);
        }

        public void BringToFront2()
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            BringToFront();
        }

        // ---------------------------------------------------------------- window placement

        private void RestorePlacement()
        {
            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            float scale = 1f;
            try { using (Graphics g = CreateGraphics()) scale = g.DpiX / 96f; } catch { }
            MinimumSize = new Size(Math.Min((int)(1040 * scale), work.Width), Math.Min((int)(680 * scale), work.Height));

            WindowState ws = services.ReadWindowState();
            Rectangle r = new Rectangle(ws.X, ws.Y, ws.W, ws.H);
            bool usable = ws.W >= 600 && ws.H >= 400;
            if (usable)
            {
                usable = false;
                foreach (Screen sc in Screen.AllScreens)
                {
                    Rectangle hit = Rectangle.Intersect(sc.WorkingArea, r);
                    if (hit.Width > 200 && hit.Height > 120) { usable = true; break; }
                }
            }
            if (!usable)
            {
                int w = Math.Min((int)(1440 * scale), (int)(work.Width * 0.9));
                int h = Math.Min((int)(920 * scale), (int)(work.Height * 0.92));
                r = new Rectangle(work.X + (work.Width - w) / 2, work.Y + (work.Height - h) / 2, w, h);
            }
            Bounds = r;
            if (ws.Maximized) WindowState = FormWindowState.Maximized;
        }

        private void SavePlacement()
        {
            try
            {
                Rectangle r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                WindowState ws = services.ReadWindowState();
                ws.X = r.X; ws.Y = r.Y; ws.W = r.Width; ws.H = r.Height;
                ws.Maximized = WindowState == FormWindowState.Maximized;
                services.WriteWindowState(ws);
            }
            catch { }
        }

        public void ApplyCaptionTheme(bool dark, Color bg, Color fg)
        {
            try
            {
                int on = dark ? 1 : 0;
                DwmSetWindowAttribute(Handle, 20, ref on, 4);                 // immersive dark mode
                int c = bg.R | (bg.G << 8) | (bg.B << 16);
                DwmSetWindowAttribute(Handle, 35, ref c, 4);                  // caption colour (Windows 11)
                DwmSetWindowAttribute(Handle, 34, ref c, 4);                  // border colour
                if (!fg.IsEmpty)
                {
                    int t = fg.R | (fg.G << 8) | (fg.B << 16);
                    DwmSetWindowAttribute(Handle, 36, ref t, 4);              // caption text colour
                }
                BackColor = bg;
                if (web != null) web.DefaultBackgroundColor = bg;
            }
            catch { }
        }

        // ---------------------------------------------------------------- WebView2 start-up

        private async void OnLoad(object sender, EventArgs e)
        {
            try
            {
                try { CoreWebView2Environment.GetAvailableBrowserVersionString(); }
                catch (Exception)
                {
                    MessageBox.Show(this,
                        "JobMech needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.\n\n" +
                        "Install the free \"Evergreen\" runtime from Microsoft and start JobMech again:\n" +
                        "https://developer.microsoft.com/microsoft-edge/webview2/",
                        "JobMech", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    Close();
                    return;
                }

                string browserArgs = "--disable-features=msSmartScreenProtection,msWebOOUI,msPdfOOUI --no-first-run";
                if (Program.DebugPort > 0) browserArgs += " --remote-debugging-port=" + Program.DebugPort + " --remote-allow-origins=*";

                Directory.CreateDirectory(Program.WebViewDir);
                CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions(browserArgs);
                env = await CoreWebView2Environment.CreateAsync(null, Program.WebViewDir, options);
                await web.EnsureCoreWebView2Async(env);

                CoreWebView2 core = web.CoreWebView2;
                CoreWebView2Settings st = core.Settings;
                st.IsStatusBarEnabled = false;
                st.AreDevToolsEnabled = Program.DevMode;
                st.AreBrowserAcceleratorKeysEnabled = Program.DevMode;
                st.IsPasswordAutosaveEnabled = false;
                st.IsGeneralAutofillEnabled = false;
                st.IsSwipeNavigationEnabled = false;
                st.IsPinchZoomEnabled = false;
                st.IsZoomControlEnabled = false;
                st.AreDefaultScriptDialogsEnabled = true;

                core.AddWebResourceRequestedFilter(Program.AppOrigin + "/*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += OnWebResourceRequested;
                core.WebMessageReceived += OnWebMessage;
                core.ContextMenuRequested += OnContextMenu;
                core.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs a)
                {
                    a.Handled = true;
                    services.OpenExternal(a.Uri);
                };
                core.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs a)
                {
                    if (!a.Uri.StartsWith(Program.AppOrigin + "/", StringComparison.OrdinalIgnoreCase))
                    {
                        a.Cancel = true;
                        if (a.IsUserInitiated) services.OpenExternal(a.Uri);
                    }
                };
                core.ProcessFailed += delegate(object s, CoreWebView2ProcessFailedEventArgs a)
                {
                    Log.Write("WEBVIEW", "Process failed: " + a.ProcessFailedKind);
                    if (a.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited ||
                        a.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                    {
                        try { core.Reload(); } catch { }
                    }
                };

                core.Navigate(Program.AppOrigin + "/index.html");
            }
            catch (Exception ex)
            {
                Log.Write("FATAL", "WebView2 start failed: " + ex);
                MessageBox.Show(this, "JobMech could not start its window engine (WebView2).\n\n" + ex.Message,
                    "JobMech", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        // The UI is served straight from the "app" folder; nothing is fetched from the internet.
        private void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            try
            {
                Uri uri = new Uri(e.Request.Uri);
                string rel = HttpUtility.UrlDecode(uri.AbsolutePath).TrimStart('/');
                if (rel.Length == 0) rel = "index.html";
                string full = Path.GetFullPath(Path.Combine(Program.AppDir, rel.Replace('/', '\\')));
                if (!full.StartsWith(Program.AppDir + "\\", StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "Content-Type: text/plain");
                    return;
                }
                MemoryStream ms = new MemoryStream(File.ReadAllBytes(full));
                e.Response = env.CreateWebResourceResponse(ms, 200, "OK",
                    "Content-Type: " + MimeOf(full) + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff");
            }
            catch (Exception ex)
            {
                Log.Write("ERROR", "Resource request failed: " + ex.Message);
                try { e.Response = env.CreateWebResourceResponse(null, 500, "Error", ""); } catch { }
            }
        }

        private static string MimeOf(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js":
                case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".ico": return "image/x-icon";
                case ".woff2": return "font/woff2";
                case ".wasm": return "application/wasm";
                case ".txt":
                case ".md": return "text/plain; charset=utf-8";
                default: return "application/octet-stream";
            }
        }

        // Keep the right-click menu for text editing only; hide the browser entries.
        private void OnContextMenu(object sender, CoreWebView2ContextMenuRequestedEventArgs e)
        {
            if (Program.DevMode) return;
            bool textual = e.ContextMenuTarget.IsEditable || e.ContextMenuTarget.HasSelection;
            if (!textual) { e.Handled = true; return; }

            string[] keep = { "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll", "undo", "redo", "spellcheck" };
            IList<CoreWebView2ContextMenuItem> items = e.MenuItems;
            for (int i = items.Count - 1; i >= 0; i--)
            {
                CoreWebView2ContextMenuItem it = items[i];
                if (it.Kind == CoreWebView2ContextMenuItemKind.Separator) continue;
                bool ok = false;
                foreach (string k in keep)
                {
                    if (it.Name != null && it.Name.StartsWith(k, StringComparison.OrdinalIgnoreCase)) { ok = true; break; }
                }
                if (!ok) items.RemoveAt(i);
            }
            // tidy leading, trailing and doubled separators
            for (int i = items.Count - 1; i >= 0; i--)
            {
                bool sep = items[i].Kind == CoreWebView2ContextMenuItemKind.Separator;
                bool edge = i == 0 || i == items.Count - 1;
                bool doubled = sep && i > 0 && items[i - 1].Kind == CoreWebView2ContextMenuItemKind.Separator;
                if (sep && (edge || doubled)) items.RemoveAt(i);
            }
            if (items.Count == 0) e.Handled = true;
        }

        // ---------------------------------------------------------------- bridge (page <-> host)

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            int id = 0;
            try
            {
                Dictionary<string, object> msg = Services.Json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                id = Convert.ToInt32(msg["id"]);
                string method = Convert.ToString(msg["m"]);
                Dictionary<string, object> p = msg.ContainsKey("p") ? msg["p"] as Dictionary<string, object> : null;
                if (p == null) p = new Dictionary<string, object>();
                // Run outside the WebView2 callback: handlers may open modal dialogs, and WebView2
                // must not be re-entered while one of its own events is still on the stack.
                int rid = id;
                BeginInvoke((MethodInvoker)delegate
                {
                    try { Dispatch(rid, method, p); }
                    catch (Exception ex) { ReplyError(rid, ex); }
                });
            }
            catch (Exception ex)
            {
                ReplyError(id, ex);
            }
        }

        private void Dispatch(int id, string method, Dictionary<string, object> p)
        {
            if (method == "http.request")
            {
                // network calls never block the window
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try { Reply(id, services.HttpRequest(p)); }
                    catch (Exception ex) { ReplyError(id, ex); }
                });
                return;
            }
            if (method == "pdf.print")
            {
                PrintPdf(id, p);
                return;
            }
            Reply(id, services.Handle(method, p));
        }

        public void Reply(int id, object result)
        {
            Dictionary<string, object> m = new Dictionary<string, object>();
            m["id"] = id;
            m["ok"] = true;
            m["r"] = result;
            Post(m);
        }

        public void ReplyError(int id, Exception ex)
        {
            Dictionary<string, object> m = new Dictionary<string, object>();
            m["id"] = id;
            m["ok"] = false;
            m["e"] = ex.Message;
            if (!(ex is UserException)) Log.Write("ERROR", ex.ToString());
            Post(m);
        }

        public void Emit(string name, object data)
        {
            Dictionary<string, object> m = new Dictionary<string, object>();
            m["ev"] = name;
            m["d"] = data;
            Post(m);
        }

        private void Post(Dictionary<string, object> message)
        {
            string json = Services.Json.Serialize(message);
            if (IsDisposed) return;
            MethodInvoker send = delegate
            {
                try { if (web != null && web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsJson(json); }
                catch (Exception ex) { Log.Write("ERROR", "Post failed: " + ex.Message); }
            };
            try
            {
                if (InvokeRequired) BeginInvoke(send); else send();
            }
            catch { }
        }

        // The page prepares a print-only layout, then asks for a PDF of exactly that.
        private async void PrintPdf(int id, Dictionary<string, object> p)
        {
            if (printing) { ReplyError(id, new UserException("Another document is still being saved. Try again in a moment.")); return; }
            printing = true;
            try
            {
                string path = services.RequireWritable(Services.S(p, "path"));
                double w = Services.D(p, "widthIn", 8.2677);
                double h = Services.D(p, "heightIn", 11.6929);

                CoreWebView2PrintSettings ps = env.CreatePrintSettings();
                ps.PageWidth = w;
                ps.PageHeight = h;
                ps.MarginTop = 0; ps.MarginBottom = 0; ps.MarginLeft = 0; ps.MarginRight = 0;
                ps.ScaleFactor = Math.Max(0.1, Math.Min(2.0, Services.D(p, "scale", 1.0)));
                ps.ShouldPrintBackgrounds = true;
                ps.ShouldPrintHeaderAndFooter = false;
                ps.ShouldPrintSelectionOnly = false;
                ps.Orientation = CoreWebView2PrintOrientation.Portrait;

                string tmp = path + ".part";
                if (File.Exists(tmp)) File.Delete(tmp);
                bool ok = await web.CoreWebView2.PrintToPdfAsync(tmp, ps);
                if (!ok || !File.Exists(tmp)) throw new UserException("The PDF could not be created.");
                try
                {
                    if (File.Exists(path)) File.Delete(path);
                    File.Move(tmp, path);
                }
                catch (IOException)
                {
                    try { File.Delete(tmp); } catch { }
                    throw new UserException("\"" + Path.GetFileName(path) + "\" is open in another program. Close it and save again.");
                }

                Dictionary<string, object> r = new Dictionary<string, object>();
                r["path"] = path;
                r["size"] = new FileInfo(path).Length;
                Reply(id, r);
            }
            catch (Exception ex)
            {
                ReplyError(id, ex);
            }
            finally
            {
                printing = false;
            }
        }

        public void OpenDevTools()
        {
            try { if (Program.DevMode) web.CoreWebView2.OpenDevToolsWindow(); } catch { }
        }

        public void ReloadPage()
        {
            try { web.CoreWebView2.Reload(); } catch { }
        }
    }

    /// <summary>An error whose message is safe and useful to show to the user as-is.</summary>
    sealed class UserException : Exception
    {
        public UserException(string message) : base(message) { }
    }

    sealed class WindowState
    {
        public int X, Y, W, H;
        public bool Maximized;
        public bool Dark;
    }
}
