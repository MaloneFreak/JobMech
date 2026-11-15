using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;

namespace JobMech
{
    class HttpReq
    {
        public string Method;
        public string Path;
        public string Body;
    }

    class Program
    {
        private static string BaseDir;
        private static string DataDir;
        private static string WebDir;
        private static string ExportsDir;
        private static string MemoryFile;
        private static string ProfileFile;
        private static string ApplicationsFile;
        private static string PhotoFile;
        private static string PortFile;
        private static int Port = 4588;
        private static JavaScriptSerializer Json;
        private static readonly object FileLock = new object();
        private static NotifyIcon TrayIcon;
        private static TcpListener ServerListener;
        private static Control UiInvoker;
        private static volatile bool IsShuttingDown = false;

        [STAThread]
        static void Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768 | SecurityProtocolType.Tls;
            Json = new JavaScriptSerializer();
            Json.MaxJsonLength = 50 * 1024 * 1024;

            BaseDir = AppDomain.CurrentDomain.BaseDirectory;
            DataDir = Path.Combine(BaseDir, "data");
            WebDir = Path.Combine(BaseDir, "web");
            ExportsDir = Path.Combine(BaseDir, "exports");

            Directory.CreateDirectory(DataDir);
            Directory.CreateDirectory(WebDir);
            Directory.CreateDirectory(ExportsDir);

            MemoryFile = Path.Combine(DataDir, "memory.md");
            ProfileFile = Path.Combine(DataDir, "profile.json");
            ApplicationsFile = Path.Combine(DataDir, "applications.json");
            PhotoFile = Path.Combine(DataDir, "photo.txt");
            PortFile = Path.Combine(DataDir, ".port");

            InitializeDefaultFiles();

            bool headlessMode = false;
            bool selfTestMode = false;
            foreach (string a in args)
            {
                if (a == "--no-browser" || a == "--server-only")
                    headlessMode = true;
                if (a == "--self-test")
                    selfTestMode = true;
                if (a.StartsWith("--port="))
                {
                    int.TryParse(a.Substring(7), out Port);
                }
            }

            if (selfTestMode)
            {
                RunSelfTest();
                return;
            }

            bool createdMutex = false;
            Mutex singleInstanceMutex = null;
            if (!headlessMode)
            {
                singleInstanceMutex = new Mutex(true, "JobMech_Desktop_Studio_SingleInstance", out createdMutex);
                if (!createdMutex)
                {
                    int activePort = Port;
                    try
                    {
                        if (File.Exists(PortFile))
                            int.TryParse(File.ReadAllText(PortFile).Trim(), out activePort);
                    }
                    catch { }
                    LaunchAppWindow("http://127.0.0.1:" + activePort + "/");
                    return;
                }
            }

            for (int p = Port; p < Port + 30; p++)
            {
                try
                {
                    ServerListener = new TcpListener(IPAddress.Loopback, p);
                    ServerListener.Start();
                    Port = p;
                    break;
                }
                catch
                {
                    ServerListener = null;
                }
            }

            if (ServerListener == null)
            {
                MessageBox.Show("JobMech could not start its local server port.", "JobMech", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try { File.WriteAllText(PortFile, Port.ToString(), Encoding.UTF8); } catch { }

            string url = "http://127.0.0.1:" + Port + "/";

            Thread serverThread = new Thread(() =>
            {
                while (!IsShuttingDown)
                {
                    try
                    {
                        TcpClient client = ServerListener.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(o => HandleClient(client));
                    }
                    catch
                    {
                        if (IsShuttingDown) break;
                    }
                }
            });
            serverThread.IsBackground = true;
            serverThread.Start();

            if (headlessMode)
            {
                while (!IsShuttingDown)
                    Thread.Sleep(500);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            UiInvoker = new Control();
            IntPtr invokerHandle = UiInvoker.Handle;

            SetupTrayIcon(url);
            LaunchAppWindow(url);

            Application.Run();

            CleanupOnExit();
            if (singleInstanceMutex != null)
            {
                try { singleInstanceMutex.ReleaseMutex(); } catch { }
                singleInstanceMutex.Dispose();
            }
        }

        private static void SetupTrayIcon(string url)
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open JobMech Studio", null, (s, e) => LaunchAppWindow(url));
            menu.Items.Add("Open Candidate Memory (memory.md)", null, (s, e) => OpenFolderInExplorer(DataDir));
            menu.Items.Add("Open Exports Folder", null, (s, e) => OpenFolderInExplorer(ExportsDir));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit JobMech", null, (s, e) => ShutdownApplication());

            TrayIcon = new NotifyIcon();
            TrayIcon.Icon = CreateJobMechTrayIcon();
            TrayIcon.Text = "JobMech Studio (Running cleanly in background)";
            TrayIcon.ContextMenuStrip = menu;
            TrayIcon.DoubleClick += (s, e) => LaunchAppWindow(url);
            TrayIcon.Visible = true;
        }

        private static Icon CreateJobMechTrayIcon()
        {
            try
            {
                Bitmap bmp = new Bitmap(32, 32);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    using (Brush bg = new SolidBrush(Color.FromArgb(37, 99, 235)))
                    {
                        g.FillEllipse(bg, 1, 1, 30, 30);
                    }
                    using (Font f = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (Brush fg = new SolidBrush(Color.White))
                    {
                        StringFormat sf = new StringFormat();
                        sf.Alignment = StringAlignment.Center;
                        sf.LineAlignment = StringAlignment.Center;
                        g.DrawString("JM", f, fg, new RectangleF(0, 0, 32, 32), sf);
                    }
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
            catch
            {
                return SystemIcons.Application;
            }
        }

        private static void ShutdownApplication()
        {
            IsShuttingDown = true;
            try
            {
                if (TrayIcon != null)
                {
                    TrayIcon.Visible = false;
                    TrayIcon.Dispose();
                }
            }
            catch { }
            try { if (ServerListener != null) ServerListener.Stop(); } catch { }
            try { if (File.Exists(PortFile)) File.Delete(PortFile); } catch { }
            Application.Exit();
        }

        private static void CleanupOnExit()
        {
            IsShuttingDown = true;
            try { if (TrayIcon != null) { TrayIcon.Visible = false; TrayIcon.Dispose(); } } catch { }
            try { if (ServerListener != null) ServerListener.Stop(); } catch { }
            try { if (File.Exists(PortFile)) File.Delete(PortFile); } catch { }
        }

        private static void OpenFolderInExplorer(string dir)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = "\"" + dir + "\"",
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private static void InitializeDefaultFiles()
        {
            if (!File.Exists(ProfileFile))
            {
                var defaultProfile = new Dictionary<string, object>
                {
                    { "setupCompleted", false },
                    { "fullName", "" },
                    { "title", "" },
                    { "email", "" },
                    { "phone", "" },
                    { "location", "" },
                    { "nationality", "" },
                    { "linkedin", "" },
                    { "portfolio", "" },
                    { "languages", "" },
                    { "birthDate", "" },
                    { "autoSaveMemory", true },
                    { "preferredPalette", "navy" },
                    { "aiProvider", "ollama" },
                    { "aiModel", "qwen2.5:7b" },
                    { "apiKey", "" },
                    { "customEndpoint", "http://127.0.0.1:11434" }
                };
                File.WriteAllText(ProfileFile, Json.Serialize(defaultProfile), Encoding.UTF8);
            }

            if (!File.Exists(MemoryFile))
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("# JobMech Candidate Memory Bank");
                sb.AppendLine();
                sb.AppendLine("> This Markdown file (`data/memory.md`) is your persistent career memory. JobMech reads this file automatically so you don't have to re-enter your story or re-answer questions for future job applications.");
                sb.AppendLine();
                sb.AppendLine("## Personal & Contact Information");
                sb.AppendLine("- **Full Name:** ");
                sb.AppendLine("- **Professional Headline:** ");
                sb.AppendLine("- **Email:** ");
                sb.AppendLine("- **Phone:** ");
                sb.AppendLine("- **Location:** ");
                sb.AppendLine("- **Nationality / Work Permit:** ");
                sb.AppendLine("- **LinkedIn:** ");
                sb.AppendLine("- **Portfolio / Website:** ");
                sb.AppendLine("- **Languages:** ");
                sb.AppendLine();
                sb.AppendLine("## Base CV & Natural Language Career Story");
                sb.AppendLine();
                sb.AppendLine();
                sb.AppendLine("## Verified Career Facts & Q&A Discoveries");
                sb.AppendLine();
                File.WriteAllText(MemoryFile, sb.ToString(), Encoding.UTF8);
            }

            if (!File.Exists(ApplicationsFile))
            {
                File.WriteAllText(ApplicationsFile, "[]", Encoding.UTF8);
            }

            if (!File.Exists(PhotoFile))
            {
                File.WriteAllText(PhotoFile, "", Encoding.UTF8);
            }
        }

        private static void LaunchAppWindow(string url)
        {
            try
            {
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";

                if (File.Exists(edgePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = "--app=" + url + " --window-size=1420,920",
                        UseShellExecute = true
                    });
                    return;
                }
                if (File.Exists(chromePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = "--app=" + url + " --window-size=1420,920",
                        UseShellExecute = true
                    });
                    return;
                }
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private static void HandleClient(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 180000;
                    client.SendTimeout = 180000;
                    NetworkStream ns = client.GetStream();

                    HttpReq req = ReadHttpRequest(ns);
                    if (req == null) return;

                    if (req.Method == "OPTIONS")
                    {
                        WriteHttpResponse(ns, "200 OK", "text/plain", new byte[0], null);
                        return;
                    }

                    if (req.Path.StartsWith("/api/"))
                    {
                        HandleApi(req, ns);
                    }
                    else
                    {
                        ServeStaticFile(req.Path, ns);
                    }
                }
                catch (Exception ex)
                {
                    try
                    {
                        WriteJson(client.GetStream(), "500 Internal Server Error", new Dictionary<string, object>
                        {
                            { "ok", false },
                            { "error", ex.Message }
                        });
                    }
                    catch { }
                }
            }
        }

        private static HttpReq ReadHttpRequest(NetworkStream ns)
        {
            MemoryStream headerBuf = new MemoryStream();
            int b;
            int state = 0;
            while ((b = ns.ReadByte()) != -1)
            {
                headerBuf.WriteByte((byte)b);
                if (state == 0 && b == '\r') state = 1;
                else if (state == 1 && b == '\n') state = 2;
                else if (state == 2 && b == '\r') state = 3;
                else if (state == 3 && b == '\n') { state = 4; break; }
                else if (b == '\r') state = 1;
                else state = 0;

                if (headerBuf.Length > 65536) break;
            }

            if (headerBuf.Length == 0) return null;

            string headerStr = Encoding.ASCII.GetString(headerBuf.ToArray());
            string[] lines = headerStr.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            if (lines.Length == 0 || string.IsNullOrEmpty(lines[0])) return null;

            string[] firstLineParts = lines[0].Split(' ');
            if (firstLineParts.Length < 2) return null;

            string method = firstLineParts[0].Trim().ToUpperInvariant();
            string rawUrl = firstLineParts[1].Trim();
            int qIdx = rawUrl.IndexOf('?');
            string path = qIdx >= 0 ? rawUrl.Substring(0, qIdx) : rawUrl;

            int contentLength = 0;
            for (int i = 1; i < lines.Length; i++)
            {
                string line = lines[i];
                if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                {
                    int.TryParse(line.Substring(15).Trim(), out contentLength);
                }
            }

            string body = "";
            if (contentLength > 0)
            {
                byte[] bodyBytes = new byte[contentLength];
                int readTotal = 0;
                while (readTotal < contentLength)
                {
                    int r = ns.Read(bodyBytes, readTotal, contentLength - readTotal);
                    if (r <= 0) break;
                    readTotal += r;
                }
                body = Encoding.UTF8.GetString(bodyBytes, 0, readTotal);
            }

            return new HttpReq
            {
                Method = method,
                Path = path,
                Body = body
            };
        }

        private static void WriteHttpResponse(NetworkStream ns, string status, string contentType, byte[] bodyBytes, string contentDisposition)
        {
            if (bodyBytes == null) bodyBytes = new byte[0];
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 " + status + "\r\n");
            sb.Append("Content-Type: " + contentType + "\r\n");
            sb.Append("Content-Length: " + bodyBytes.Length + "\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
            sb.Append("Cache-Control: no-cache\r\n");
            if (!string.IsNullOrEmpty(contentDisposition))
            {
                sb.Append("Content-Disposition: " + contentDisposition + "\r\n");
            }
            sb.Append("Connection: close\r\n\r\n");

            byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
            ns.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
            {
                ns.Write(bodyBytes, 0, bodyBytes.Length);
            }
            ns.Flush();
        }

        private static void WriteJson(NetworkStream ns, string status, object payload)
        {
            string jsonStr = Json.Serialize(payload);
            byte[] bytes = Encoding.UTF8.GetBytes(jsonStr);
            WriteHttpResponse(ns, status, "application/json; charset=utf-8", bytes, null);
        }

        private static void ServeStaticFile(string path, NetworkStream ns)
        {
            if (path == "/" || string.IsNullOrEmpty(path))
                path = "/index.html";

            string cleanRel = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string fullPath = Path.Combine(WebDir, cleanRel);

            if (!File.Exists(fullPath))
            {
                byte[] nf = Encoding.UTF8.GetBytes("Not found: " + path);
                WriteHttpResponse(ns, "404 Not Found", "text/plain; charset=utf-8", nf, null);
                return;
            }

            string ext = Path.GetExtension(fullPath).ToLowerInvariant();
            string contentType = "application/octet-stream";
            if (ext == ".html") contentType = "text/html; charset=utf-8";
            else if (ext == ".css") contentType = "text/css; charset=utf-8";
            else if (ext == ".js") contentType = "application/javascript; charset=utf-8";
            else if (ext == ".json") contentType = "application/json; charset=utf-8";
            else if (ext == ".svg") contentType = "image/svg+xml";
            else if (ext == ".png") contentType = "image/png";
            else if (ext == ".jpg" || ext == ".jpeg") contentType = "image/jpeg";

            byte[] bytes = File.ReadAllBytes(fullPath);
            WriteHttpResponse(ns, "200 OK", contentType, bytes, null);
        }

        private static void HandleApi(HttpReq req, NetworkStream ns)
        {
            string path = req.Path;

            if (path == "/api/state" && req.Method == "GET")
            {
                lock (FileLock)
                {
                    var profile = Json.DeserializeObject(File.ReadAllText(ProfileFile, Encoding.UTF8));
                    var applications = Json.DeserializeObject(File.ReadAllText(ApplicationsFile, Encoding.UTF8));
                    string memoryMd = File.ReadAllText(MemoryFile, Encoding.UTF8);
                    string photoData = File.Exists(PhotoFile) ? File.ReadAllText(PhotoFile, Encoding.UTF8) : "";

                    string baseStory = ExtractSectionFromMemory(memoryMd, "## Base CV & Natural Language Career Story");
                    string learnedFacts = ExtractSectionFromMemory(memoryMd, "## Verified Career Facts & Q&A Discoveries");

                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "profile", profile },
                        { "applications", applications },
                        { "memoryMd", memoryMd },
                        { "memoryPath", MemoryFile },
                        { "exportsPath", ExportsDir },
                        { "baseStory", baseStory },
                        { "learnedFacts", learnedFacts },
                        { "photo", photoData }
                    });
                }
                return;
            }

            if (path == "/api/profile" && req.Method == "POST")
            {
                lock (FileLock)
                {
                    var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                    if (data.ContainsKey("photo"))
                    {
                        string photoStr = Convert.ToString(data["photo"] ?? "");
                        File.WriteAllText(PhotoFile, photoStr, Encoding.UTF8);
                        data.Remove("photo");
                    }

                    var existing = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(ProfileFile, Encoding.UTF8));
                    foreach (var kv in data)
                    {
                        existing[kv.Key] = kv.Value;
                    }
                    File.WriteAllText(ProfileFile, Json.Serialize(existing), Encoding.UTF8);

                    SyncProfileIntoMemoryMd(existing);

                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "profile", existing },
                        { "memoryMd", File.ReadAllText(MemoryFile, Encoding.UTF8) }
                    });
                }
                return;
            }

            if (path == "/api/memory" && req.Method == "POST")
            {
                lock (FileLock)
                {
                    var data = Json.Deserialize<Dictionary<string, object>>(req.Body);

                    if (data.ContainsKey("rawMarkdown"))
                    {
                        string raw = Convert.ToString(data["rawMarkdown"] ?? "");
                        File.WriteAllText(MemoryFile, raw, Encoding.UTF8);
                    }
                    else
                    {
                        string baseStory = data.ContainsKey("baseStory") ? Convert.ToString(data["baseStory"] ?? "") : null;
                        string newFacts = data.ContainsKey("newFacts") ? Convert.ToString(data["newFacts"] ?? "") : null;
                        string jobLabel = data.ContainsKey("jobLabel") ? Convert.ToString(data["jobLabel"] ?? "") : "";
                        UpdateMemorySections(baseStory, newFacts, jobLabel);
                    }

                    string updatedMd = File.ReadAllText(MemoryFile, Encoding.UTF8);
                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "memoryMd", updatedMd },
                        { "baseStory", ExtractSectionFromMemory(updatedMd, "## Base CV & Natural Language Career Story") },
                        { "learnedFacts", ExtractSectionFromMemory(updatedMd, "## Verified Career Facts & Q&A Discoveries") }
                    });
                }
                return;
            }

            if (path == "/api/applications" && req.Method == "POST")
            {
                lock (FileLock)
                {
                    var appItem = Json.Deserialize<Dictionary<string, object>>(req.Body);
                    var listObj = Json.Deserialize<List<Dictionary<string, object>>>(File.ReadAllText(ApplicationsFile, Encoding.UTF8));
                    if (listObj == null) listObj = new List<Dictionary<string, object>>();

                    string id = appItem.ContainsKey("id") ? Convert.ToString(appItem["id"]) : "";
                    int existingIndex = -1;
                    for (int i = 0; i < listObj.Count; i++)
                    {
                        if (listObj[i].ContainsKey("id") && Convert.ToString(listObj[i]["id"]) == id)
                        {
                            existingIndex = i;
                            break;
                        }
                    }

                    if (existingIndex >= 0)
                        listObj[existingIndex] = appItem;
                    else
                        listObj.Insert(0, appItem);

                    File.WriteAllText(ApplicationsFile, Json.Serialize(listObj), Encoding.UTF8);
                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "applications", listObj }
                    });
                }
                return;
            }

            if (path == "/api/applications/delete" && req.Method == "POST")
            {
                lock (FileLock)
                {
                    var reqData = Json.Deserialize<Dictionary<string, object>>(req.Body);
                    string id = reqData.ContainsKey("id") ? Convert.ToString(reqData["id"]) : "";
                    var listObj = Json.Deserialize<List<Dictionary<string, object>>>(File.ReadAllText(ApplicationsFile, Encoding.UTF8));
                    if (listObj == null) listObj = new List<Dictionary<string, object>>();
                    listObj.RemoveAll(x => x.ContainsKey("id") && Convert.ToString(x["id"]) == id);
                    File.WriteAllText(ApplicationsFile, Json.Serialize(listObj), Encoding.UTF8);
                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "applications", listObj }
                    });
                }
                return;
            }

            if (path == "/api/extract-text" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleExtractText(data, ns);
                return;
            }

            if (path == "/api/ollama/status" && req.Method == "GET")
            {
                HandleOllamaStatus(ns);
                return;
            }

            if (path == "/api/ollama/pull" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                string modelName = data.ContainsKey("model") ? Convert.ToString(data["model"]) : "qwen2.5:7b";
                HandleOllamaPull(modelName, ns);
                return;
            }

            if (path == "/api/ollama/install" && req.Method == "POST")
            {
                HandleOllamaInstall(ns);
                return;
            }

            if (path == "/api/ai/chat" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleAiChat(data, ns);
                return;
            }

            if (path == "/api/export/docx" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleExportDocx(data, ns);
                return;
            }

            if (path == "/api/export/pdf" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleExportPdf(data, ns);
                return;
            }

            if (path == "/api/export/save-native" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleSaveNativeDialog(data, ns);
                return;
            }

            if (path == "/api/pick-save-prefix" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandlePickSavePrefix(data, ns);
                return;
            }

            if (path == "/api/export/save-pair" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleSavePairToFolder(data, ns);
                return;
            }

            if (path == "/api/export/save-both-native" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                HandleSaveBothNativeDialog(data, ns);
                return;
            }

            if (path == "/api/open-folder" && req.Method == "POST")
            {
                var data = Json.Deserialize<Dictionary<string, object>>(req.Body);
                string target = data.ContainsKey("target") ? Convert.ToString(data["target"]) : "data";
                string dirToOpen = target == "exports" ? ExportsDir : DataDir;
                OpenFolderInExplorer(dirToOpen);
                WriteJson(ns, "200 OK", new Dictionary<string, object> { { "ok", true } });
                return;
            }

            if (path == "/api/shutdown" && req.Method == "POST")
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object> { { "ok", true } });
                ThreadPool.QueueUserWorkItem(o =>
                {
                    Thread.Sleep(250);
                    ShutdownApplication();
                });
                return;
            }

            WriteJson(ns, "404 Not Found", new Dictionary<string, object> { { "ok", false }, { "error", "Unknown endpoint" } });
        }

        // =====================================================================
        // MEMORY.MD PARSING & SYNCHRONIZATION
        // =====================================================================
        private static string ExtractSectionFromMemory(string md, string heading)
        {
            if (string.IsNullOrEmpty(md)) return "";
            string norm = md.Replace("\r\n", "\n");
            int idx = norm.IndexOf(heading, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return "";
            int start = idx + heading.Length;
            int nextHeading = norm.IndexOf("\n## ", start, StringComparison.Ordinal);
            string content = nextHeading >= 0 ? norm.Substring(start, nextHeading - start) : norm.Substring(start);
            return content.Trim();
        }

        private static void SyncProfileIntoMemoryMd(Dictionary<string, object> profile)
        {
            string md = File.Exists(MemoryFile) ? File.ReadAllText(MemoryFile, Encoding.UTF8) : "";
            string baseStory = ExtractSectionFromMemory(md, "## Base CV & Natural Language Career Story");
            string learnedFacts = ExtractSectionFromMemory(md, "## Verified Career Facts & Q&A Discoveries");

            WriteStructuredMemory(profile, baseStory, learnedFacts);
        }

        private static void UpdateMemorySections(string newBaseStory, string newFacts, string jobLabel)
        {
            var profile = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(ProfileFile, Encoding.UTF8));
            string md = File.Exists(MemoryFile) ? File.ReadAllText(MemoryFile, Encoding.UTF8) : "";
            string currentBaseStory = ExtractSectionFromMemory(md, "## Base CV & Natural Language Career Story");
            string currentFacts = ExtractSectionFromMemory(md, "## Verified Career Facts & Q&A Discoveries");

            if (!string.IsNullOrWhiteSpace(newBaseStory))
            {
                currentBaseStory = newBaseStory.Trim();
            }

            if (!string.IsNullOrWhiteSpace(newFacts))
            {
                string cleanFact = newFacts.Replace("\r\n", "\n").Trim();
                string normCurrent = currentFacts.Replace("\r\n", "\n");
                if (!string.IsNullOrWhiteSpace(cleanFact))
                {
                    // Deduplicate per contextual Q&A block if already recorded in memory.md
                    string[] rawBlocks = Regex.Split(cleanFact, @"\n(?=- \*\*Context:\*\*|- \*\*Additional Note:\*\*)");
                    List<string> newBlocks = new List<string>();
                    foreach (string blk in rawBlocks)
                    {
                        string t = blk.Trim();
                        if (!string.IsNullOrWhiteSpace(t) && !normCurrent.Contains(t))
                        {
                            newBlocks.Add(t);
                        }
                    }

                    if (newBlocks.Count > 0)
                    {
                        string joined = string.Join("\r\n", newBlocks.ToArray()).Replace("\n", "\r\n").Replace("\r\r\n", "\r\n");
                        string dateStamp = DateTime.Now.ToString("yyyy-MM-dd");
                        string headerTag = string.IsNullOrWhiteSpace(jobLabel)
                            ? "### Added on " + dateStamp
                            : "### Added from Application: " + jobLabel + " (" + dateStamp + ")";
                        if (!string.IsNullOrWhiteSpace(currentFacts))
                            currentFacts += "\r\n\r\n" + headerTag + "\r\n" + joined;
                        else
                            currentFacts = headerTag + "\r\n" + joined;
                    }
                }
            }

            WriteStructuredMemory(profile, currentBaseStory, currentFacts);
        }

        private static string GetStr(Dictionary<string, object> d, string key)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
                return Convert.ToString(d[key]);
            return "";
        }

        private static void WriteStructuredMemory(Dictionary<string, object> profile, string baseStory, string learnedFacts)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("# JobMech Candidate Memory Bank");
            sb.AppendLine();
            sb.AppendLine("> This Markdown file (`data/memory.md`) is your persistent career memory. JobMech reads this file automatically so you don't have to re-enter your story or re-answer questions for future job applications.");
            sb.AppendLine();
            sb.AppendLine("## Personal & Contact Information");
            sb.AppendLine("- **Full Name:** " + GetStr(profile, "fullName"));
            sb.AppendLine("- **Professional Headline:** " + GetStr(profile, "title"));
            sb.AppendLine("- **Email:** " + GetStr(profile, "email"));
            sb.AppendLine("- **Phone:** " + GetStr(profile, "phone"));
            sb.AppendLine("- **Location:** " + GetStr(profile, "location"));
            sb.AppendLine("- **Nationality / Work Permit:** " + GetStr(profile, "nationality"));
            sb.AppendLine("- **LinkedIn:** " + GetStr(profile, "linkedin"));
            sb.AppendLine("- **Portfolio / Website:** " + GetStr(profile, "portfolio"));
            sb.AppendLine("- **Languages:** " + GetStr(profile, "languages"));
            if (!string.IsNullOrWhiteSpace(GetStr(profile, "birthDate")))
                sb.AppendLine("- **Date of Birth:** " + GetStr(profile, "birthDate"));
            sb.AppendLine();
            sb.AppendLine("## Base CV & Natural Language Career Story");
            sb.AppendLine(string.IsNullOrWhiteSpace(baseStory) ? "" : baseStory.Trim());
            sb.AppendLine();
            sb.AppendLine("## Verified Career Facts & Q&A Discoveries");
            sb.AppendLine(string.IsNullOrWhiteSpace(learnedFacts) ? "" : learnedFacts.Trim());
            sb.AppendLine();

            File.WriteAllText(MemoryFile, sb.ToString(), Encoding.UTF8);
        }

        // =====================================================================
        // ATTACHMENT TEXT EXTRACTION (.PDF, .DOCX, .MD, .TXT)
        // =====================================================================
        private static void HandleExtractText(Dictionary<string, object> data, NetworkStream ns)
        {
            string fileName = GetStr(data, "fileName");
            string b64 = GetStr(data, "base64Data");
            if (b64.Contains("base64,"))
                b64 = b64.Substring(b64.IndexOf("base64,") + 7);

            if (string.IsNullOrEmpty(b64))
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object> { { "ok", false }, { "error", "Empty file payload." } });
                return;
            }

            try
            {
                byte[] fileBytes = Convert.FromBase64String(b64);
                string ext = Path.GetExtension(fileName).ToLowerInvariant();
                string extracted = "";

                if (ext == ".docx")
                {
                    extracted = ExtractDocxText(fileBytes);
                }
                else if (ext == ".pdf")
                {
                    extracted = PdfTextExtractor.Extract(fileBytes);
                }
                else
                {
                    // .md, .txt, etc.
                    if (fileBytes.Length >= 3 && fileBytes[0] == 0xEF && fileBytes[1] == 0xBB && fileBytes[2] == 0xBF)
                        extracted = Encoding.UTF8.GetString(fileBytes, 3, fileBytes.Length - 3);
                    else if (fileBytes.Length >= 2 && fileBytes[0] == 0xFF && fileBytes[1] == 0xFE)
                        extracted = Encoding.Unicode.GetString(fileBytes, 2, fileBytes.Length - 2);
                    else if (fileBytes.Length >= 2 && fileBytes[0] == 0xFE && fileBytes[1] == 0xFF)
                        extracted = Encoding.BigEndianUnicode.GetString(fileBytes, 2, fileBytes.Length - 2);
                    else
                        extracted = Encoding.UTF8.GetString(fileBytes);
                }

                extracted = (extracted ?? "").Trim();
                if (string.IsNullOrWhiteSpace(extracted))
                {
                    WriteJson(ns, "200 OK", new Dictionary<string, object>
                    {
                        { "ok", false },
                        { "error", "Could not detect selectable text in " + fileName + " (if this PDF is a scanned image, please copy-paste text or attach a .DOCX / .MD file)." }
                    });
                    return;
                }

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "fileName", fileName },
                    { "text", extracted }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", "Failed to read " + fileName + ": " + ex.Message }
                });
            }
        }

        private static string ExtractDocxText(byte[] docxBytes)
        {
            StringBuilder sb = new StringBuilder();
            using (MemoryStream ms = new MemoryStream(docxBytes))
            using (ZipArchive zip = new ZipArchive(ms, ZipArchiveMode.Read))
            {
                List<string> partNames = new List<string>();
                foreach (ZipArchiveEntry e in zip.Entries)
                {
                    string n = e.FullName.Replace('\\', '/').ToLowerInvariant();
                    if (n.StartsWith("word/header") && n.EndsWith(".xml")) partNames.Add(e.FullName);
                }
                if (zip.GetEntry("word/document.xml") != null)
                    partNames.Add("word/document.xml");
                foreach (ZipArchiveEntry e in zip.Entries)
                {
                    string n = e.FullName.Replace('\\', '/').ToLowerInvariant();
                    if (n.StartsWith("word/footer") && n.EndsWith(".xml")) partNames.Add(e.FullName);
                }

                foreach (string part in partNames)
                {
                    ZipArchiveEntry entry = zip.GetEntry(part);
                    if (entry == null) continue;
                    using (Stream s = entry.Open())
                    {
                        XmlDocument doc = new XmlDocument();
                        doc.Load(s);
                        XmlNode body = doc.DocumentElement;
                        if (body != null)
                        {
                            ExtractWordXmlNode(body, sb);
                        }
                    }
                }
            }
            return Regex.Replace(sb.ToString(), @"(\r?\n){3,}", "\r\n\r\n").Trim();
        }

        private static void ExtractWordXmlNode(XmlNode node, StringBuilder sb)
        {
            if (node == null) return;
            string local = node.LocalName;

            if (local == "p")
            {
                StringBuilder line = new StringBuilder();
                CollectWordParagraphText(node, line);
                string t = line.ToString().Trim();
                if (!string.IsNullOrEmpty(t))
                    sb.AppendLine(t);
                return;
            }
            if (local == "tr")
            {
                List<string> cells = new List<string>();
                foreach (XmlNode child in node.ChildNodes)
                {
                    if (child.LocalName == "tc")
                    {
                        StringBuilder cellSb = new StringBuilder();
                        ExtractWordXmlNode(child, cellSb);
                        string cellTxt = Regex.Replace(cellSb.ToString().Trim(), @"\r?\n+", " | ");
                        if (!string.IsNullOrEmpty(cellTxt)) cells.Add(cellTxt);
                    }
                }
                if (cells.Count > 0)
                    sb.AppendLine(string.Join("  |  ", cells.ToArray()));
                return;
            }

            foreach (XmlNode child in node.ChildNodes)
            {
                ExtractWordXmlNode(child, sb);
            }
        }

        private static void CollectWordParagraphText(XmlNode node, StringBuilder line)
        {
            if (node == null) return;
            string local = node.LocalName;
            if (local == "t")
            {
                line.Append(node.InnerText);
                return;
            }
            if (local == "tab")
            {
                line.Append("  ");
                return;
            }
            if (local == "br" || local == "cr")
            {
                line.Append("\r\n");
                return;
            }
            foreach (XmlNode child in node.ChildNodes)
            {
                CollectWordParagraphText(child, line);
            }
        }

        // =====================================================================
        // OLLAMA & AI CHAT BACKEND
        // =====================================================================
        private static void HandleOllamaStatus(NetworkStream ns)
        {
            bool running = false;
            List<string> installedModels = new List<string>();
            bool binaryInstalled = false;

            string localAppOllama = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Ollama\ollama.exe");
            if (File.Exists(localAppOllama)) binaryInstalled = true;

            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:11434/api/tags");
                req.Method = "GET";
                req.Timeout = 1800;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    running = true;
                    binaryInstalled = true;
                    string json = sr.ReadToEnd();
                    var parsed = Json.Deserialize<Dictionary<string, object>>(json);
                    if (parsed != null && parsed.ContainsKey("models") && parsed["models"] is ArrayList)
                    {
                        foreach (object item in (ArrayList)parsed["models"])
                        {
                            var m = item as Dictionary<string, object>;
                            if (m != null && m.ContainsKey("name"))
                                installedModels.Add(Convert.ToString(m["name"]));
                        }
                    }
                }
            }
            catch
            {
                running = false;
            }

            WriteJson(ns, "200 OK", new Dictionary<string, object>
            {
                { "ok", true },
                { "running", running },
                { "binaryInstalled", binaryInstalled },
                { "models", installedModels }
            });
        }

        private static void HandleOllamaPull(string modelName, NetworkStream ns)
        {
            try
            {
                string ollamaExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Ollama\ollama.exe");
                string cmdFile = File.Exists(ollamaExe) ? ollamaExe : "ollama";

                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoExit -Command \"Write-Host 'Downloading local AI model " + modelName + " via Ollama...' -ForegroundColor Cyan; & '" + cmdFile + "' pull " + modelName + "; Write-Host 'Done! You can now return to JobMech.' -ForegroundColor Green\"",
                    UseShellExecute = true
                });

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "message", "Started downloading " + modelName + " in a terminal window." }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", "Could not start Ollama pull: " + ex.Message }
                });
            }
        }

        private static void HandleOllamaInstall(NetworkStream ns)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoExit -Command \"Write-Host 'Installing Ollama Local AI Runtime via Winget...' -ForegroundColor Cyan; winget install -e --id Ollama.Ollama; Write-Host 'Once installed, click Refresh Status in JobMech!' -ForegroundColor Green\"",
                    UseShellExecute = true
                });

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "message", "Launched Ollama installer via Winget." }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", ex.Message }
                });
            }
        }

        private static void HandleAiChat(Dictionary<string, object> data, NetworkStream ns)
        {
            string provider = GetStr(data, "provider").ToLowerInvariant();
            string model = GetStr(data, "model");
            string apiKey = GetStr(data, "apiKey").Trim();
            string endpoint = GetStr(data, "endpoint").Trim();
            string systemPrompt = GetStr(data, "systemPrompt");
            string userPrompt = GetStr(data, "userPrompt");

            try
            {
                string reply = "";
                if (provider == "gemini")
                {
                    if (string.IsNullOrEmpty(model)) model = "gemini-2.5-flash";
                    string url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
                    var payload = new Dictionary<string, object>
                    {
                        { "system_instruction", new Dictionary<string, object> {
                            { "parts", new object[] { new Dictionary<string, object> { { "text", systemPrompt } } } }
                        }},
                        { "contents", new object[] {
                            new Dictionary<string, object> {
                                { "role", "user" },
                                { "parts", new object[] { new Dictionary<string, object> { { "text", userPrompt } } } }
                            }
                        }},
                        { "generationConfig", new Dictionary<string, object> {
                            { "temperature", 0.45 }
                        }}
                    };
                    string respJson = HttpPostJson(url, Json.Serialize(payload), null);
                    var parsed = Json.Deserialize<Dictionary<string, object>>(respJson);
                    var candidates = parsed["candidates"] as ArrayList;
                    var firstCand = candidates[0] as Dictionary<string, object>;
                    var content = firstCand["content"] as Dictionary<string, object>;
                    var parts = content["parts"] as ArrayList;
                    var firstPart = parts[0] as Dictionary<string, object>;
                    reply = Convert.ToString(firstPart["text"]);
                }
                else if (provider == "anthropic")
                {
                    if (string.IsNullOrEmpty(model)) model = "claude-3-5-sonnet-latest";
                    string url = "https://api.anthropic.com/v1/messages";
                    var payload = new Dictionary<string, object>
                    {
                        { "model", model },
                        { "max_tokens", 4096 },
                        { "system", systemPrompt },
                        { "messages", new object[] {
                            new Dictionary<string, object> { { "role", "user" }, { "content", userPrompt } }
                        }}
                    };
                    var headers = new Dictionary<string, string>
                    {
                        { "x-api-key", apiKey },
                        { "anthropic-version", "2023-06-01" }
                    };
                    string respJson = HttpPostJson(url, Json.Serialize(payload), headers);
                    var parsed = Json.Deserialize<Dictionary<string, object>>(respJson);
                    var content = parsed["content"] as ArrayList;
                    var firstBlock = content[0] as Dictionary<string, object>;
                    reply = Convert.ToString(firstBlock["text"]);
                }
                else if (provider == "openai" || provider == "openrouter" || provider == "groq" || provider == "lmstudio")
                {
                    string url = "https://api.openai.com/v1/chat/completions";
                    if (provider == "openrouter") url = "https://openrouter.ai/api/v1/chat/completions";
                    else if (provider == "groq") url = "https://api.groq.com/openai/v1/chat/completions";
                    else if (provider == "lmstudio")
                    {
                        url = string.IsNullOrEmpty(endpoint) ? "http://127.0.0.1:1234/v1/chat/completions" : endpoint.TrimEnd('/') + "/v1/chat/completions";
                    }
                    else if (!string.IsNullOrEmpty(endpoint) && endpoint.StartsWith("http") && !endpoint.Contains("11434"))
                    {
                        url = endpoint;
                    }

                    var payload = new Dictionary<string, object>
                    {
                        { "model", string.IsNullOrEmpty(model) ? "gpt-4o" : model },
                        { "temperature", 0.45 },
                        { "messages", new object[] {
                            new Dictionary<string, object> { { "role", "system" }, { "content", systemPrompt } },
                            new Dictionary<string, object> { { "role", "user" }, { "content", userPrompt } }
                        }}
                    };
                    var headers = new Dictionary<string, string>();
                    if (!string.IsNullOrEmpty(apiKey))
                        headers["Authorization"] = "Bearer " + apiKey;

                    string respJson = HttpPostJson(url, Json.Serialize(payload), headers);
                    var parsed = Json.Deserialize<Dictionary<string, object>>(respJson);
                    var choices = parsed["choices"] as ArrayList;
                    var firstChoice = choices[0] as Dictionary<string, object>;
                    var msg = firstChoice["message"] as Dictionary<string, object>;
                    reply = Convert.ToString(msg["content"]);
                }
                else
                {
                    string baseOllama = string.IsNullOrEmpty(endpoint) ? "http://127.0.0.1:11434" : endpoint.TrimEnd('/');
                    string url = baseOllama + "/api/chat";
                    var payload = new Dictionary<string, object>
                    {
                        { "model", string.IsNullOrEmpty(model) ? "qwen2.5:7b" : model },
                        { "stream", false },
                        { "options", new Dictionary<string, object> { { "temperature", 0.45 } } },
                        { "messages", new object[] {
                            new Dictionary<string, object> { { "role", "system" }, { "content", systemPrompt } },
                            new Dictionary<string, object> { { "role", "user" }, { "content", userPrompt } }
                        }}
                    };
                    string respJson = HttpPostJson(url, Json.Serialize(payload), null);
                    var parsed = Json.Deserialize<Dictionary<string, object>>(respJson);
                    var msg = parsed["message"] as Dictionary<string, object>;
                    reply = Convert.ToString(msg["content"]);
                }

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "reply", reply }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", ex.Message }
                });
            }
        }

        private static string HttpPostJson(string url, string jsonBody, Dictionary<string, string> headers)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json; charset=utf-8";
            req.Timeout = 180000;
            if (headers != null)
            {
                foreach (var kv in headers)
                {
                    req.Headers[kv.Key] = kv.Value;
                }
            }

            byte[] bodyBytes = Encoding.UTF8.GetBytes(jsonBody);
            req.ContentLength = bodyBytes.Length;
            using (Stream s = req.GetRequestStream())
            {
                s.Write(bodyBytes, 0, bodyBytes.Length);
            }

            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    return sr.ReadToEnd();
                }
            }
            catch (WebException wex)
            {
                if (wex.Response != null)
                {
                    using (StreamReader sr = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                    {
                        string errBody = sr.ReadToEnd();
                        throw new Exception("API Error: " + errBody);
                    }
                }
                throw;
            }
        }

        // =====================================================================
        // REAL OPENXML (.DOCX) GENERATOR WITH PHOTO, PALETTE & COUNTRY LAYOUT
        // =====================================================================
        private static void HandleExportDocx(Dictionary<string, object> data, NetworkStream ns)
        {
            string fileName = SafeFileName(GetStr(data, "fileName"));
            if (string.IsNullOrEmpty(fileName)) fileName = "JobMech_Document";
            if (!fileName.EndsWith(".docx", StringComparison.OrdinalIgnoreCase))
                fileName += ".docx";

            byte[] docxBytes = BuildDocxBytesFromPayload(data);

            string savedPath = Path.Combine(ExportsDir, fileName);
            try { File.WriteAllBytes(savedPath, docxBytes); } catch { }

            WriteHttpResponse(
                ns,
                "200 OK",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                docxBytes,
                "attachment; filename=\"" + fileName + "\""
            );
        }

        private static byte[] BuildDocxBytesFromPayload(Dictionary<string, object> data)
        {
            string docType = GetStr(data, "docType");
            string primaryHex = GetStr(data, "primaryHex").TrimStart('#');
            string secondaryHex = GetStr(data, "secondaryHex").TrimStart('#');
            if (string.IsNullOrEmpty(primaryHex)) primaryHex = "1B365D";
            if (string.IsNullOrEmpty(secondaryHex)) secondaryHex = "2B547E";

            string countryCode = GetStr(data, "countryCode").ToUpperInvariant();
            bool includePhoto = data.ContainsKey("includePhoto") && Convert.ToBoolean(data["includePhoto"]);
            string photoDataUri = GetStr(data, "photoDataUri");

            byte[] photoBytes = null;
            string photoExt = "jpeg";
            if (includePhoto && !string.IsNullOrEmpty(photoDataUri) && photoDataUri.Contains("base64,"))
            {
                try
                {
                    if (photoDataUri.Contains("image/png")) photoExt = "png";
                    string b64 = photoDataUri.Substring(photoDataUri.IndexOf("base64,") + 7);
                    photoBytes = Convert.FromBase64String(b64);
                }
                catch { photoBytes = null; }
            }

            return BuildOpenXmlDocx(data, docType, primaryHex, secondaryHex, countryCode, photoBytes, photoExt);
        }

        private static byte[] BuildOpenXmlDocx(Dictionary<string, object> data, string docType, string primaryHex, string secondaryHex, string countryCode, byte[] photoBytes, string photoExt)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                using (ZipArchive zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    AddZipText(zip, "[Content_Types].xml",
                        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                        "<Default Extension=\"jpeg\" ContentType=\"image/jpeg\"/>" +
                        "<Default Extension=\"jpg\" ContentType=\"image/jpeg\"/>" +
                        "<Default Extension=\"png\" ContentType=\"image/png\"/>" +
                        "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
                        "</Types>");

                    AddZipText(zip, "_rels/.rels",
                        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
                        "</Relationships>");

                    string docRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">";
                    if (photoBytes != null && docType == "cv")
                    {
                        string mediaName = "photo." + photoExt;
                        docRels += "<Relationship Id=\"rIdPhoto\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/" + mediaName + "\"/>";
                        ZipArchiveEntry imgEntry = zip.CreateEntry("word/media/" + mediaName);
                        using (Stream s = imgEntry.Open())
                        {
                            s.Write(photoBytes, 0, photoBytes.Length);
                        }
                    }
                    docRels += "</Relationships>";
                    AddZipText(zip, "word/_rels/document.xml.rels", docRels);

                    string documentXml = docType == "coverLetter"
                        ? BuildCoverLetterDocumentXml(data, primaryHex, secondaryHex, countryCode)
                        : BuildCvDocumentXml(data, primaryHex, secondaryHex, countryCode, photoBytes != null);

                    AddZipText(zip, "word/document.xml", documentXml);
                }
                return ms.ToArray();
            }
        }

        private static string XmlEsc(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&apos;");
        }

        private static string BuildCvDocumentXml(Dictionary<string, object> data, string primaryHex, string secondaryHex, string countryCode, bool hasPhoto)
        {
            string fullName = GetStr(data, "fullName");
            string headline = GetStr(data, "headline");
            string contactLine = GetStr(data, "contactLine");
            string personalMetaLine = GetStr(data, "personalMetaLine");
            string summary = GetStr(data, "summary");
            string signatureLine = GetStr(data, "signatureLine");

            StringBuilder body = new StringBuilder();

            if (hasPhoto)
            {
                body.Append("<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblBorders>" +
                    "<w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"8\" w:color=\"" + primaryHex + "\"/>" +
                    "</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w=\"7500\"/><w:gridCol w:w=\"2200\"/></w:tblGrid><w:tr>");

                body.Append("<w:tc><w:tcPr><w:tcW w:w=\"3800\" w:type=\"pct\"/><w:vAlign w:val=\"center\"/></w:tcPr>");
                body.Append(MakePara(fullName, primaryHex, 44, true, false, 60, 40, "left"));
                if (!string.IsNullOrWhiteSpace(headline))
                    body.Append(MakePara(headline, secondaryHex, 24, true, false, 0, 80, "left"));
                if (!string.IsNullOrWhiteSpace(contactLine))
                    body.Append(MakePara(contactLine, "333333", 19, false, false, 0, 40, "left"));
                if (!string.IsNullOrWhiteSpace(personalMetaLine))
                    body.Append(MakePara(personalMetaLine, "555555", 18, false, false, 0, 80, "left"));
                body.Append("</w:tc>");

                body.Append("<w:tc><w:tcPr><w:tcW w:w=\"1200\" w:type=\"pct\"/><w:vAlign w:val=\"center\"/></w:tcPr>");
                body.Append(MakePhotoInlineParagraph("rIdPhoto", 1150000L, 1480000L));
                body.Append("</w:tc></w:tr></w:tbl>");
            }
            else
            {
                string align = (countryCode == "US" || countryCode == "CA") ? "center" : "left";
                body.Append(MakePara(fullName, primaryHex, 44, true, false, 0, 40, align));
                if (!string.IsNullOrWhiteSpace(headline))
                    body.Append(MakePara(headline, secondaryHex, 24, true, false, 0, 60, align));
                if (!string.IsNullOrWhiteSpace(contactLine))
                    body.Append(MakePara(contactLine, "333333", 19, false, false, 0, 40, align));
                if (!string.IsNullOrWhiteSpace(personalMetaLine))
                    body.Append(MakeParaWithBottomBorder(personalMetaLine, "555555", 18, primaryHex, align));
                else
                    body.Append(MakeDividerPara(primaryHex));
            }

            if (!string.IsNullOrWhiteSpace(summary))
            {
                string profTitle = countryCode == "DE" || countryCode == "AT" || countryCode == "CH"
                    ? "EXECUTIVE PROFILE"
                    : (countryCode == "GB" || countryCode == "AU" ? "PERSONAL PROFILE" : "PROFESSIONAL SUMMARY");
                body.Append(MakeSectionHeading(profTitle, primaryHex));
                body.Append(MakePara(summary, "222222", 21, false, false, 40, 120, "both"));
            }

            if (data.ContainsKey("experience") && data["experience"] is ArrayList)
            {
                ArrayList expList = (ArrayList)data["experience"];
                if (expList.Count > 0)
                {
                    body.Append(MakeSectionHeading("PROFESSIONAL EXPERIENCE", primaryHex));

                    foreach (object item in expList)
                    {
                        var exp = item as Dictionary<string, object>;
                        if (exp == null) continue;
                        string role = GetStr(exp, "role");
                        string company = GetStr(exp, "company");
                        string location = GetStr(exp, "location");
                        string period = GetStr(exp, "period");

                        string leftHeader = role;
                        if (!string.IsNullOrWhiteSpace(company)) leftHeader += " | " + company;
                        if (!string.IsNullOrWhiteSpace(location)) leftHeader += " (" + location + ")";

                        body.Append(MakeTwoColRow(leftHeader, period, primaryHex, secondaryHex));

                        if (exp.ContainsKey("bullets") && exp["bullets"] is ArrayList)
                        {
                            foreach (object bObj in (ArrayList)exp["bullets"])
                            {
                                string bText = Convert.ToString(bObj ?? "").Trim();
                                if (!string.IsNullOrEmpty(bText))
                                    body.Append(MakeBulletPara(bText));
                            }
                        }
                    }
                }
            }

            if (data.ContainsKey("education") && data["education"] is ArrayList)
            {
                ArrayList eduList = (ArrayList)data["education"];
                if (eduList.Count > 0)
                {
                    body.Append(MakeSectionHeading("EDUCATION & QUALIFICATIONS", primaryHex));
                    foreach (object item in eduList)
                    {
                        var edu = item as Dictionary<string, object>;
                        if (edu == null) continue;
                        string degree = GetStr(edu, "degree");
                        string institution = GetStr(edu, "institution");
                        string period = GetStr(edu, "period");
                        string details = GetStr(edu, "details");

                        string leftEdu = degree;
                        if (!string.IsNullOrWhiteSpace(institution)) leftEdu += " | " + institution;
                        body.Append(MakeTwoColRow(leftEdu, period, primaryHex, secondaryHex));
                        if (!string.IsNullOrWhiteSpace(details))
                            body.Append(MakePara(details, "333333", 20, false, false, 20, 80, "left"));
                    }
                }
            }

            if (data.ContainsKey("skills") && data["skills"] is ArrayList)
            {
                ArrayList skills = (ArrayList)data["skills"];
                if (skills.Count > 0)
                {
                    body.Append(MakeSectionHeading("CORE COMPETENCIES & TECHNICAL SKILLS", primaryHex));
                    List<string> skillStrs = new List<string>();
                    foreach (object s in skills)
                    {
                        string st = Convert.ToString(s ?? "").Trim();
                        if (!string.IsNullOrEmpty(st)) skillStrs.Add(st);
                    }
                    body.Append(MakePara(string.Join("  •  ", skillStrs.ToArray()), "222222", 20, false, false, 40, 120, "left"));
                }
            }

            string languagesLine = GetStr(data, "languagesLine");
            string additionalInfo = GetStr(data, "additionalInfo");
            if (!string.IsNullOrWhiteSpace(languagesLine) || !string.IsNullOrWhiteSpace(additionalInfo))
            {
                body.Append(MakeSectionHeading("LANGUAGES & ADDITIONAL INFORMATION", primaryHex));
                if (!string.IsNullOrWhiteSpace(languagesLine))
                    body.Append(MakePara("Languages: " + languagesLine, "222222", 20, false, false, 20, 60, "left"));
                if (!string.IsNullOrWhiteSpace(additionalInfo))
                    body.Append(MakePara(additionalInfo, "222222", 20, false, false, 20, 80, "left"));
            }

            if (!string.IsNullOrWhiteSpace(signatureLine))
            {
                body.Append(MakePara(signatureLine, "444444", 19, false, true, 240, 40, "left"));
            }

            return WrapDocumentXml(body.ToString());
        }

        private static string BuildCoverLetterDocumentXml(Dictionary<string, object> data, string primaryHex, string secondaryHex, string countryCode)
        {
            string fullName = GetStr(data, "fullName");
            string headline = GetStr(data, "headline");
            string contactLine = GetStr(data, "contactLine");
            string dateLine = GetStr(data, "dateLine");
            string recipientBlock = GetStr(data, "recipientBlock");
            string subjectLine = GetStr(data, "subjectLine");
            string salutation = GetStr(data, "salutation");
            string bodyText = GetStr(data, "bodyText");
            string signOff = GetStr(data, "signOff");

            StringBuilder body = new StringBuilder();

            body.Append(MakePara(fullName, primaryHex, 40, true, false, 0, 40, "left"));
            if (!string.IsNullOrWhiteSpace(headline))
                body.Append(MakePara(headline, secondaryHex, 23, true, false, 0, 60, "left"));
            if (!string.IsNullOrWhiteSpace(contactLine))
                body.Append(MakeParaWithBottomBorder(contactLine, "333333", 19, primaryHex, "left"));

            if (!string.IsNullOrWhiteSpace(dateLine))
            {
                string dateAlign = (countryCode == "DE" || countryCode == "AT" || countryCode == "CH" || countryCode == "FR") ? "right" : "left";
                body.Append(MakePara(dateLine, "444444", 20, false, false, 160, 120, dateAlign));
            }

            if (!string.IsNullOrWhiteSpace(recipientBlock))
            {
                string[] rLines = recipientBlock.Replace("\r\n", "\n").Split('\n');
                foreach (string rl in rLines)
                {
                    if (!string.IsNullOrWhiteSpace(rl))
                        body.Append(MakePara(rl.Trim(), "222222", 21, false, false, 0, 40, "left"));
                }
            }

            if (!string.IsNullOrWhiteSpace(subjectLine))
            {
                body.Append(MakePara(subjectLine, primaryHex, 23, true, false, 180, 140, "left"));
            }

            if (!string.IsNullOrWhiteSpace(salutation))
            {
                body.Append(MakePara(salutation, "111111", 21, true, false, 80, 120, "left"));
            }

            if (!string.IsNullOrWhiteSpace(bodyText))
            {
                string[] paras = bodyText.Replace("\r\n", "\n").Split(new string[] { "\n\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string p in paras)
                {
                    if (!string.IsNullOrWhiteSpace(p))
                        body.Append(MakePara(p.Trim(), "1F2937", 21, false, false, 60, 140, "both"));
                }
            }

            if (!string.IsNullOrWhiteSpace(signOff))
            {
                body.Append(MakePara(signOff, "111111", 21, false, false, 180, 80, "left"));
            }
            body.Append(MakePara(fullName, primaryHex, 23, true, false, 40, 40, "left"));

            return WrapDocumentXml(body.ToString());
        }

        private static string WrapDocumentXml(string innerBody)
        {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
                "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
                "xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" " +
                "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
                "xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
                "<w:body>" + innerBody +
                "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"900\" w:right=\"950\" w:bottom=\"900\" w:left=\"950\"/></w:sectPr>" +
                "</w:body></w:document>";
        }

        private static string MakePara(string text, string colorHex, int fontSizeHalfPts, bool bold, bool italic, int spaceBefore, int spaceAfter, string align)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("<w:p><w:pPr>");
            sb.Append("<w:spacing w:before=\"" + spaceBefore + "\" w:after=\"" + spaceAfter + "\" w:line=\"276\" w:lineRule=\"auto\"/>");
            sb.Append("<w:jc w:val=\"" + align + "\"/>");
            sb.Append("</w:pPr><w:r><w:rPr>");
            sb.Append("<w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:cs=\"Calibri\"/>");
            if (bold) sb.Append("<w:b/>");
            if (italic) sb.Append("<w:i/>");
            sb.Append("<w:color w:val=\"" + colorHex + "\"/>");
            sb.Append("<w:sz w:val=\"" + fontSizeHalfPts + "\"/>");
            sb.Append("</w:rPr><w:t xml:space=\"preserve\">" + XmlEsc(text) + "</w:t></w:r></w:p>");
            return sb.ToString();
        }

        private static string MakeParaWithBottomBorder(string text, string colorHex, int fontSizeHalfPts, string borderHex, string align)
        {
            return "<w:p><w:pPr>" +
                "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"8\" w:color=\"" + borderHex + "\"/></w:pBdr>" +
                "<w:spacing w:before=\"20\" w:after=\"140\"/>" +
                "<w:jc w:val=\"" + align + "\"/>" +
                "</w:pPr><w:r><w:rPr>" +
                "<w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\"/>" +
                "<w:color w:val=\"" + colorHex + "\"/>" +
                "<w:sz w:val=\"" + fontSizeHalfPts + "\"/>" +
                "</w:rPr><w:t xml:space=\"preserve\">" + XmlEsc(text) + "</w:t></w:r></w:p>";
        }

        private static string MakeDividerPara(string borderHex)
        {
            return "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"4\" w:color=\"" + borderHex + "\"/></w:pBdr><w:spacing w:before=\"20\" w:after=\"120\"/></w:pPr></w:p>";
        }

        private static string MakeSectionHeading(string title, string primaryHex)
        {
            return "<w:p><w:pPr>" +
                "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"3\" w:color=\"" + primaryHex + "\"/></w:pBdr>" +
                "<w:spacing w:before=\"200\" w:after=\"80\"/>" +
                "</w:pPr><w:r><w:rPr>" +
                "<w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\"/>" +
                "<w:b/><w:color w:val=\"" + primaryHex + "\"/><w:sz w:val=\"22\"/>" +
                "</w:rPr><w:t xml:space=\"preserve\">" + XmlEsc(title.ToUpperInvariant()) + "</w:t></w:r></w:p>";
        }

        private static string MakeTwoColRow(string leftText, string rightText, string primaryHex, string secondaryHex)
        {
            return "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/></w:tblPr>" +
                "<w:tblGrid><w:gridCol w:w=\"7500\"/><w:gridCol w:w=\"2500\"/></w:tblGrid>" +
                "<w:tr><w:tc><w:tcPr><w:tcW w:w=\"3750\" w:type=\"pct\"/></w:tcPr>" +
                MakePara(leftText, "111111", 21, true, false, 80, 20, "left") +
                "</w:tc><w:tc><w:tcPr><w:tcW w:w=\"1250\" w:type=\"pct\"/></w:tcPr>" +
                MakePara(rightText, secondaryHex, 19, true, false, 80, 20, "right") +
                "</w:tc></w:tr></w:tbl>";
        }

        private static string MakeBulletPara(string text)
        {
            return "<w:p><w:pPr>" +
                "<w:spacing w:before=\"20\" w:after=\"50\" w:line=\"260\" w:lineRule=\"auto\"/>" +
                "<w:ind w:left=\"360\" w:hanging=\"220\"/>" +
                "</w:pPr><w:r><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\"/><w:sz w:val=\"20\"/><w:color w:val=\"222222\"/></w:rPr>" +
                "<w:t xml:space=\"preserve\">•  " + XmlEsc(text) + "</w:t></w:r></w:p>";
        }

        private static string MakePhotoInlineParagraph(string relId, long cx, long cy)
        {
            return "<w:p><w:pPr><w:jc w:val=\"right\"/></w:pPr><w:r><w:drawing>" +
                "<wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\">" +
                "<wp:extent cx=\"" + cx + "\" cy=\"" + cy + "\"/>" +
                "<wp:docPr id=\"1\" name=\"CandidatePhoto\"/>" +
                "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
                "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\"Photo\"/><pic:cNvPicPr/></pic:nvPicPr>" +
                "<pic:blipFill><a:blip r:embed=\"" + relId + "\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
                "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"" + cx + "\" cy=\"" + cy + "\"/></a:xfrm>" +
                "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
                "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";
        }

        private static void AddZipText(ZipArchive zip, string entryName, string content)
        {
            ZipArchiveEntry entry = zip.CreateEntry(entryName);
            using (Stream s = entry.Open())
            using (StreamWriter sw = new StreamWriter(s, new UTF8Encoding(false)))
            {
                sw.Write(content);
            }
        }

        // =====================================================================
        // ZERO-BROWSER-DIALOG .PDF GENERATOR (ISOLATED HEADLESS + PURE C# PDF)
        // =====================================================================
        private static void HandleExportPdf(Dictionary<string, object> data, NetworkStream ns)
        {
            string fileName = SafeFileName(GetStr(data, "fileName"));
            if (string.IsNullOrEmpty(fileName)) fileName = "JobMech_Document";
            if (!fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                fileName += ".pdf";

            byte[] pdfBytes = GeneratePdfBytes(data);

            string outputPdf = Path.Combine(ExportsDir, fileName);
            try { File.WriteAllBytes(outputPdf, pdfBytes); } catch { }

            WriteHttpResponse(ns, "200 OK", "application/pdf", pdfBytes, "attachment; filename=\"" + fileName + "\"");
        }

        private static byte[] TryReadCompletePdf(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                byte[] bytes;
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (fs.Length <= 800) return null;
                    bytes = new byte[fs.Length];
                    int totalRead = 0;
                    while (totalRead < bytes.Length)
                    {
                        int read = fs.Read(bytes, totalRead, bytes.Length - totalRead);
                        if (read <= 0) break;
                        totalRead += read;
                    }
                    if (totalRead != bytes.Length) return null;
                }

                // Verify PDF header (%PDF-) and trailer (%%EOF) so we never grab a partial flush
                if (bytes[0] != 0x25 || bytes[1] != 0x50 || bytes[2] != 0x44 || bytes[3] != 0x46 || bytes[4] != 0x2D)
                {
                    return null;
                }

                int tailStart = Math.Max(0, bytes.Length - 128);
                string tail = Encoding.ASCII.GetString(bytes, tailStart, bytes.Length - tailStart);
                if (!tail.Contains("%%EOF")) return null;

                return bytes;
            }
            catch
            {
                return null;
            }
        }

        private static void KillProcessTreeSafe(Process p)
        {
            if (p == null) return;
            try
            {
                if (p.HasExited) return;
                int pid = p.Id;
                try
                {
                    ProcessStartInfo tk = new ProcessStartInfo
                    {
                        FileName = "taskkill",
                        Arguments = "/F /T /PID " + pid,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    using (Process kp = Process.Start(tk))
                    {
                        if (kp != null) kp.WaitForExit(1500);
                    }
                }
                catch { }

                try
                {
                    if (!p.HasExited) p.Kill();
                }
                catch { }
            }
            catch { }
        }

        private static byte[] GeneratePdfBytes(Dictionary<string, object> data)
        {
            string htmlContent = GetStr(data, "html");
            string guid = Guid.NewGuid().ToString("N");
            string tempDir = Path.Combine(Path.GetTempPath(), "JobMech_PDF_" + guid);
            Directory.CreateDirectory(tempDir);
            string tempHtml = Path.Combine(tempDir, "doc.html");
            string tempPdf = Path.Combine(tempDir, "doc.pdf");

            try
            {
                if (!string.IsNullOrWhiteSpace(htmlContent))
                {
                    File.WriteAllText(tempHtml, htmlContent, Encoding.UTF8);

                    string[] chromePaths = new string[]
                    {
                        @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                        @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
                    };
                    string[] edgePaths = new string[]
                    {
                        @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                        @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
                    };

                    var selectedBrowsers = new List<string>();
                    foreach (string c in chromePaths)
                    {
                        if (File.Exists(c)) { selectedBrowsers.Add(c); break; }
                    }
                    foreach (string e in edgePaths)
                    {
                        if (File.Exists(e)) { selectedBrowsers.Add(e); break; }
                    }

                    string fileUri = new Uri(tempHtml).AbsoluteUri;
                    for (int idx = 0; idx < selectedBrowsers.Count; idx++)
                    {
                        string exe = selectedBrowsers[idx];
                        string profileDir = Path.Combine(tempDir, "p_" + idx);
                        Directory.CreateDirectory(profileDir);
                        int maxWaitMs = idx == 0 ? 11500 : 4000;

                        try
                        {
                            if (File.Exists(tempPdf)) File.Delete(tempPdf);
                            ProcessStartInfo psi = new ProcessStartInfo
                            {
                                FileName = exe,
                                Arguments = "--headless=new --no-sandbox --disable-gpu --no-pdf-header-footer --no-first-run --no-default-browser-check --disable-extensions --disable-background-networking --disable-default-apps --disable-sync --disable-component-update --user-data-dir=\"" + profileDir + "\" --print-to-pdf=\"" + tempPdf + "\" \"" + fileUri + "\"",
                                CreateNoWindow = true,
                                UseShellExecute = false,
                                WindowStyle = ProcessWindowStyle.Hidden
                            };

                            using (Process p = Process.Start(psi))
                            {
                                if (p != null)
                                {
                                    Stopwatch waitWatch = Stopwatch.StartNew();
                                    byte[] readyPdf = null;
                                    while (waitWatch.ElapsedMilliseconds < maxWaitMs)
                                    {
                                        readyPdf = TryReadCompletePdf(tempPdf);
                                        if (readyPdf != null) break;
                                        if (p.HasExited)
                                        {
                                            readyPdf = TryReadCompletePdf(tempPdf);
                                            break;
                                        }
                                        Thread.Sleep(100);
                                    }

                                    if (readyPdf == null)
                                    {
                                        readyPdf = TryReadCompletePdf(tempPdf);
                                    }

                                    if (!p.HasExited)
                                    {
                                        // Give Chrome/Edge a brief moment to self-exit cleanly before terminating lingering GPU/headless subprocesses
                                        if (!p.WaitForExit(150))
                                        {
                                            KillProcessTreeSafe(p);
                                        }
                                    }

                                    if (readyPdf != null)
                                    {
                                        return readyPdf;
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
            }
            finally
            {
                try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); } catch { }
            }

            // Always fall back cleanly to our pure C# PDF 1.4 vector/text engine (never browser print!)
            return NativePdfBuilder.BuildPdf(data);
        }

        // =====================================================================
        // NATIVE WINDOWS SAVE FILE DIALOGS (STA THREAD)
        // =====================================================================
        private static string GetDefaultExportDirectory()
        {
            try
            {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrEmpty(userProfile))
                {
                    string downloads = Path.Combine(userProfile, "Downloads");
                    if (Directory.Exists(downloads)) return downloads;
                }
            }
            catch { }
            return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        }

        private static string RunSaveFileDialogOnCurrentStaThread(string title, string defaultFileName, string filter, string defaultExt)
        {
            using (Form owner = new Form())
            {
                owner.TopMost = true;
                owner.ShowInTaskbar = false;
                owner.FormBorderStyle = FormBorderStyle.FixedToolWindow;
                owner.Size = new Size(1, 1);
                owner.StartPosition = FormStartPosition.Manual;
                owner.Location = new Point(-32000, -32000);
                owner.Show();
                owner.Activate();

                using (SaveFileDialog sfd = new SaveFileDialog())
                {
                    sfd.Title = title;
                    sfd.FileName = defaultFileName;
                    sfd.Filter = filter;
                    sfd.DefaultExt = defaultExt;
                    sfd.AddExtension = true;
                    sfd.OverwritePrompt = false;
                    sfd.RestoreDirectory = true;
                    sfd.InitialDirectory = GetDefaultExportDirectory();

                    if (sfd.ShowDialog(owner) == DialogResult.OK)
                    {
                        return sfd.FileName;
                    }
                }
            }
            return null;
        }

        private static string ShowWindowsSaveDialog(string title, string defaultFileName, string filter, string defaultExt)
        {
            if (UiInvoker != null && !UiInvoker.IsDisposed && UiInvoker.IsHandleCreated)
            {
                if (!UiInvoker.InvokeRequired)
                {
                    return RunSaveFileDialogOnCurrentStaThread(title, defaultFileName, filter, defaultExt);
                }

                string marshaledPath = null;
                UiInvoker.Invoke((MethodInvoker)delegate
                {
                    marshaledPath = RunSaveFileDialogOnCurrentStaThread(title, defaultFileName, filter, defaultExt);
                });
                return marshaledPath;
            }

            string chosenPath = null;
            Thread sta = new Thread(() =>
            {
                chosenPath = RunSaveFileDialogOnCurrentStaThread(title, defaultFileName, filter, defaultExt);
            });
            sta.SetApartmentState(ApartmentState.STA);
            sta.Start();
            sta.Join();
            return chosenPath;
        }

        private static Dictionary<string, object> ToStringObjectDict(object raw)
        {
            if (raw is Dictionary<string, object>) return (Dictionary<string, object>)raw;
            var res = new Dictionary<string, object>();
            var idict = raw as IDictionary;
            if (idict != null)
            {
                foreach (DictionaryEntry de in idict)
                    res[Convert.ToString(de.Key)] = de.Value;
            }
            return res;
        }

        private static void HandleSaveNativeDialog(Dictionary<string, object> data, NetworkStream ns)
        {
            string format = GetStr(data, "format").ToLowerInvariant() == "docx" ? "docx" : "pdf";
            string defaultName = SafeFileName(GetStr(data, "fileName"));
            if (string.IsNullOrEmpty(defaultName)) defaultName = "JobMech_Document";

            string ext = "." + format;
            if (!defaultName.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
                defaultName += ext;

            string title = format == "pdf" ? "Save Formatted PDF Document" : "Save Formatted Word Document (.DOCX)";
            string filter = format == "pdf" ? "PDF Document (*.pdf)|*.pdf" : "Microsoft Word Document (*.docx)|*.docx";
            string chosenPath = ShowWindowsSaveDialog(title, defaultName, filter, format);

            if (string.IsNullOrEmpty(chosenPath))
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "cancelled", true }
                });
                return;
            }

            byte[] fileBytes = format == "pdf"
                ? GeneratePdfBytes(data)
                : BuildDocxBytesFromPayload(data);

            File.WriteAllBytes(chosenPath, fileBytes);
            WriteJson(ns, "200 OK", new Dictionary<string, object>
            {
                { "ok", true },
                { "cancelled", false },
                { "savedPath", chosenPath }
            });
        }

        private static string SanitizeFileStem(string rawStem, string fallbackPrefix)
        {
            string stem = (rawStem ?? "").Trim();
            stem = Regex.Replace(stem, @"(_CV|_CoverLetter)$", "", RegexOptions.IgnoreCase).Trim('_', ' ');
            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                stem = stem.Replace(invalid, '_');
            }
            if (string.IsNullOrWhiteSpace(stem)) return fallbackPrefix;
            return stem.Trim();
        }

        private static string CleanPairBaseStem(string chosenPath, string fallbackPrefix)
        {
            return SanitizeFileStem(Path.GetFileNameWithoutExtension(chosenPath) ?? "", fallbackPrefix);
        }

        private static void GenerateDocumentPairBytes(string format, Dictionary<string, object> cvData, Dictionary<string, object> clData, out byte[] cvBytes, out byte[] clBytes)
        {
            byte[] cvResult = null;
            byte[] clResult = null;
            Exception cvErr = null;
            Exception clErr = null;

            Thread clWorker = new Thread(() =>
            {
                try
                {
                    clResult = format == "pdf" ? GeneratePdfBytes(clData) : BuildDocxBytesFromPayload(clData);
                }
                catch (Exception ex)
                {
                    clErr = ex;
                }
            });
            clWorker.IsBackground = true;
            clWorker.Start();

            try
            {
                cvResult = format == "pdf" ? GeneratePdfBytes(cvData) : BuildDocxBytesFromPayload(cvData);
            }
            catch (Exception ex)
            {
                cvErr = ex;
            }

            clWorker.Join();

            if (cvErr != null) throw new Exception("CV generation failed: " + cvErr.Message, cvErr);
            if (clErr != null) throw new Exception("Cover Letter generation failed: " + clErr.Message, clErr);

            cvBytes = cvResult;
            clBytes = clResult;
        }

        private static void HandlePickSavePrefix(Dictionary<string, object> data, NetworkStream ns)
        {
            string format = GetStr(data, "format").ToLowerInvariant() == "docx" ? "docx" : "pdf";
            string prefix = SafeFileName(GetStr(data, "filePrefix"));
            if (string.IsNullOrEmpty(prefix)) prefix = "JobMech_Application";

            string ext = "." + format;
            string title = "Choose Folder & Base Name (Saves Separate CV & Cover Letter " + ext.ToUpperInvariant() + " Files)";
            string filter = format == "pdf"
                ? "PDF Files - Saves CV & Cover Letter (*.pdf)|*.pdf"
                : "Word Documents - Saves CV & Cover Letter (*.docx)|*.docx";

            string chosenPath = ShowWindowsSaveDialog(title, prefix + ext, filter, format);
            if (string.IsNullOrEmpty(chosenPath))
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "cancelled", true }
                });
                return;
            }

            string targetDir = Path.GetDirectoryName(chosenPath);
            string baseStem = CleanPairBaseStem(chosenPath, prefix);
            string folderName = Path.GetFileName(targetDir);
            if (string.IsNullOrEmpty(folderName)) folderName = targetDir;

            WriteJson(ns, "200 OK", new Dictionary<string, object>
            {
                { "ok", true },
                { "cancelled", false },
                { "targetDir", targetDir },
                { "folderName", folderName },
                { "baseStem", baseStem }
            });
        }

        private static void HandleSavePairToFolder(Dictionary<string, object> data, NetworkStream ns)
        {
            string format = GetStr(data, "format").ToLowerInvariant() == "docx" ? "docx" : "pdf";
            string targetDir = GetStr(data, "targetDir");
            string baseStem = GetStr(data, "baseStem");
            if (string.IsNullOrWhiteSpace(targetDir) || !Directory.Exists(targetDir))
            {
                WriteJson(ns, "400 Bad Request", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", "Destination folder does not exist." }
                });
                return;
            }

            baseStem = SanitizeFileStem(baseStem, "JobMech_Application");
            string ext = "." + format;
            string cvPath = Path.Combine(targetDir, baseStem + "_CV" + ext);
            string clPath = Path.Combine(targetDir, baseStem + "_CoverLetter" + ext);

            var cvData = data.ContainsKey("cvPayload") ? ToStringObjectDict(data["cvPayload"]) : data;
            var clData = data.ContainsKey("clPayload") ? ToStringObjectDict(data["clPayload"]) : data;

            try
            {
                byte[] cvBytes;
                byte[] clBytes;
                GenerateDocumentPairBytes(format, cvData, clData, out cvBytes, out clBytes);

                File.WriteAllBytes(cvPath, cvBytes);
                File.WriteAllBytes(clPath, clBytes);

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "cvPath", cvPath },
                    { "clPath", clPath },
                    { "cvFileName", Path.GetFileName(cvPath) },
                    { "clFileName", Path.GetFileName(clPath) },
                    { "folder", targetDir }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "500 Internal Server Error", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", ex.Message }
                });
            }
        }

        private static void HandleSaveBothNativeDialog(Dictionary<string, object> data, NetworkStream ns)
        {
            string format = GetStr(data, "format").ToLowerInvariant() == "docx" ? "docx" : "pdf";
            string prefix = SafeFileName(GetStr(data, "filePrefix"));
            if (string.IsNullOrEmpty(prefix)) prefix = "JobMech_Application";

            string ext = "." + format;
            string title = "Choose Folder & Base Name (Saves Separate CV & Cover Letter " + ext.ToUpperInvariant() + " Files)";
            string filter = format == "pdf"
                ? "PDF Files - Saves CV & Cover Letter (*.pdf)|*.pdf"
                : "Word Documents - Saves CV & Cover Letter (*.docx)|*.docx";

            string chosenPath = ShowWindowsSaveDialog(title, prefix + ext, filter, format);
            if (string.IsNullOrEmpty(chosenPath))
            {
                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "cancelled", true }
                });
                return;
            }

            string targetDir = Path.GetDirectoryName(chosenPath);
            string baseStem = CleanPairBaseStem(chosenPath, prefix);

            string cvPath = Path.Combine(targetDir, baseStem + "_CV" + ext);
            string clPath = Path.Combine(targetDir, baseStem + "_CoverLetter" + ext);

            var cvData = data.ContainsKey("cvPayload") ? ToStringObjectDict(data["cvPayload"]) : data;
            var clData = data.ContainsKey("clPayload") ? ToStringObjectDict(data["clPayload"]) : data;

            try
            {
                byte[] cvBytes;
                byte[] clBytes;
                GenerateDocumentPairBytes(format, cvData, clData, out cvBytes, out clBytes);

                File.WriteAllBytes(cvPath, cvBytes);
                File.WriteAllBytes(clPath, clBytes);

                WriteJson(ns, "200 OK", new Dictionary<string, object>
                {
                    { "ok", true },
                    { "cancelled", false },
                    { "cvPath", cvPath },
                    { "clPath", clPath },
                    { "folder", targetDir }
                });
            }
            catch (Exception ex)
            {
                WriteJson(ns, "500 Internal Server Error", new Dictionary<string, object>
                {
                    { "ok", false },
                    { "error", ex.Message }
                });
            }
        }

        private static string SafeFileName(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return "JobMech_Document";
            string cleaned = Regex.Replace(input, @"[^a-zA-Z0-9_\-\.]", "_");
            return cleaned;
        }

        private static void RunSelfTest()
        {
            Console.WriteLine("Running JobMech Self-Test...");
            Console.WriteLine("1. Memory File exists: " + File.Exists(MemoryFile));
            Console.WriteLine("2. Profile File exists: " + File.Exists(ProfileFile));
            Console.WriteLine("3. Applications File exists: " + File.Exists(ApplicationsFile));

            var testData = new Dictionary<string, object>
            {
                { "docType", "cv" },
                { "fullName", "Pedro Almeida" },
                { "headline", "Senior Mechanical Design Engineer" },
                { "contactLine", "Munich, Germany • pedro@example.com" },
                { "personalMetaLine", "Nationality: Brazilian (EU Blue Card) | Languages: English (C1), German (B1)" },
                { "summary", "Experienced engineer designing thermal systems and aluminum housings in Munich." },
                { "primaryHex", "1B365D" },
                { "secondaryHex", "2B547E" },
                { "tintHex", "F0F4F8" },
                { "countryCode", "DE" },
                { "signatureLine", "Munich, 2026-11-12 - Pedro Almeida" }
            };

            byte[] docxBytes = BuildOpenXmlDocx(testData, "cv", "1B365D", "2B547E", "DE", null, "jpeg");
            string docxText = ExtractDocxText(docxBytes);
            Console.WriteLine("4. Generated OpenXML .DOCX bytes: " + docxBytes.Length + ", Extracted chars: " + docxText.Length);

            byte[] nativePdfBytes = NativePdfBuilder.BuildPdf(testData);
            string pdfText = PdfTextExtractor.Extract(nativePdfBytes);
            Console.WriteLine("5. Generated Native .PDF bytes: " + nativePdfBytes.Length + ", Extracted PDF text contains name: " + pdfText.Contains("Pedro Almeida"));

            if (docxBytes.Length < 500 || !docxText.Contains("Pedro Almeida") || nativePdfBytes.Length < 500 || !pdfText.Contains("Pedro Almeida"))
            {
                throw new Exception("Self-test assertion failed!");
            }

            Console.WriteLine("Self-Test PASSED!");
        }
    }

    // =========================================================================
    // PURE C# PDF TEXT EXTRACTOR (DECOMPRESSES FLATE + PARSES TOUNICODE CMAPS)
    // =========================================================================
    static class PdfTextExtractor
    {
        public static string Extract(byte[] pdfBytes)
        {
            if (pdfBytes == null || pdfBytes.Length == 0) return "";

            List<byte[]> allStreams = CollectAllDecompressedStreams(pdfBytes);
            Dictionary<string, string> globalCMap = new Dictionary<string, string>();
            List<string> textStreams = new List<string>();

            foreach (byte[] rawStream in allStreams)
            {
                string asLatin = Encoding.GetEncoding(1252).GetString(rawStream);
                if (asLatin.Contains("beginbfchar") || asLatin.Contains("beginbfrange"))
                {
                    ParseToUnicodeCMap(asLatin, globalCMap);
                }
                if (asLatin.Contains("BT") && (asLatin.Contains("Tj") || asLatin.Contains("TJ")))
                {
                    textStreams.Add(asLatin);
                }
            }

            if (textStreams.Count == 0)
            {
                // Fallback: scan uncompressed PDF text directly
                string whole = Encoding.GetEncoding(1252).GetString(pdfBytes);
                if (whole.Contains("BT") && (whole.Contains("Tj") || whole.Contains("TJ")))
                {
                    textStreams.Add(whole);
                }
            }

            StringBuilder result = new StringBuilder();
            foreach (string streamText in textStreams)
            {
                ExtractTextOperators(streamText, globalCMap, result);
                result.AppendLine();
            }

            string finalStr = result.ToString();
            finalStr = finalStr.Replace("\uFB01", "fi").Replace("\uFB02", "fl").Replace("\u00A0", " ");
            finalStr = Regex.Replace(finalStr, @"[ \t]{2,}", " ");
            finalStr = Regex.Replace(finalStr, @"(\r?\n){3,}", "\r\n\r\n");
            return finalStr.Trim();
        }

        private static List<byte[]> CollectAllDecompressedStreams(byte[] pdf)
        {
            List<byte[]> streams = new List<byte[]>();
            int pos = 0;
            byte[] startMarker = Encoding.ASCII.GetBytes("stream");
            byte[] endMarker = Encoding.ASCII.GetBytes("endstream");

            while (pos < pdf.Length)
            {
                int sIdx = IndexOfBytes(pdf, startMarker, pos);
                if (sIdx < 0) break;

                int dataStart = sIdx + startMarker.Length;
                if (dataStart < pdf.Length && pdf[dataStart] == '\r') dataStart++;
                if (dataStart < pdf.Length && pdf[dataStart] == '\n') dataStart++;

                int eIdx = IndexOfBytes(pdf, endMarker, dataStart);
                if (eIdx < 0) break;

                int dataEnd = eIdx;
                while (dataEnd > dataStart && (pdf[dataEnd - 1] == '\n' || pdf[dataEnd - 1] == '\r'))
                    dataEnd--;

                int len = dataEnd - dataStart;
                if (len > 0)
                {
                    // Check preceding dictionary for Image XObject to skip binary image streams
                    int dictLookback = Math.Max(0, sIdx - 320);
                    string dictHeader = Encoding.ASCII.GetString(pdf, dictLookback, sIdx - dictLookback);
                    if (!dictHeader.Contains("/Subtype/Image") && !dictHeader.Contains("/Subtype /Image"))
                    {
                        byte[] raw = new byte[len];
                        Buffer.BlockCopy(pdf, dataStart, raw, 0, len);

                        if (dictHeader.Contains("/FlateDecode"))
                        {
                            byte[] inflated = TryInflateZlib(raw);
                            if (inflated != null && inflated.Length > 0)
                                streams.Add(inflated);
                        }
                        else
                        {
                            streams.Add(raw);
                        }
                    }
                }
                pos = eIdx + endMarker.Length;
            }
            return streams;
        }

        private static byte[] TryInflateZlib(byte[] data)
        {
            if (data == null || data.Length < 3) return null;

            // Zlib header check (typically 0x78)
            int offset = (data[0] == 0x78) ? 2 : 0;
            try
            {
                using (MemoryStream input = new MemoryStream(data, offset, data.Length - offset))
                using (DeflateStream ds = new DeflateStream(input, CompressionMode.Decompress))
                using (MemoryStream output = new MemoryStream())
                {
                    ds.CopyTo(output);
                    return output.ToArray();
                }
            }
            catch
            {
                if (offset != 0)
                {
                    try
                    {
                        using (MemoryStream input = new MemoryStream(data))
                        using (DeflateStream ds = new DeflateStream(input, CompressionMode.Decompress))
                        using (MemoryStream output = new MemoryStream())
                        {
                            ds.CopyTo(output);
                            return output.ToArray();
                        }
                    }
                    catch { }
                }
                return null;
            }
        }

        private static int IndexOfBytes(byte[] haystack, byte[] needle, int start)
        {
            for (int i = start; i <= haystack.Length - needle.Length; i++)
            {
                bool match = true;
                for (int j = 0; j < needle.Length; j++)
                {
                    if (haystack[i + j] != needle[j])
                    {
                        match = false;
                        break;
                    }
                }
                if (match) return i;
            }
            return -1;
        }

        private static void ParseToUnicodeCMap(string cmap, Dictionary<string, string> map)
        {
            foreach (Match m in Regex.Matches(cmap, @"beginbfchar\s*(.*?)\s*endbfchar", RegexOptions.Singleline))
            {
                string block = m.Groups[1].Value;
                foreach (Match pair in Regex.Matches(block, @"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>"))
                {
                    string srcHex = pair.Groups[1].Value.ToUpperInvariant();
                    string dstHex = pair.Groups[2].Value.ToUpperInvariant();
                    map[srcHex] = DecodeUtf16BeHex(dstHex);
                }
            }

            foreach (Match m in Regex.Matches(cmap, @"beginbfrange\s*(.*?)\s*endbfrange", RegexOptions.Singleline))
            {
                string block = m.Groups[1].Value;
                foreach (Match rng in Regex.Matches(block, @"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>"))
                {
                    int startCode = Convert.ToInt32(rng.Groups[1].Value, 16);
                    int endCode = Convert.ToInt32(rng.Groups[2].Value, 16);
                    int dstCode = Convert.ToInt32(rng.Groups[3].Value, 16);
                    int hexLen = rng.Groups[1].Value.Length;
                    for (int code = startCode; code <= endCode && (code - startCode) < 512; code++)
                    {
                        string key = code.ToString("X" + hexLen);
                        map[key] = char.ConvertFromUtf32(dstCode + (code - startCode));
                    }
                }
            }
        }

        private static string DecodeUtf16BeHex(string hex)
        {
            if (string.IsNullOrEmpty(hex)) return "";
            if (hex.Length % 2 != 0) hex = "0" + hex;
            byte[] bytes = new byte[hex.Length / 2];
            for (int i = 0; i < bytes.Length; i++)
                bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            if (bytes.Length == 1)
                return Encoding.GetEncoding(1252).GetString(bytes);
            return Encoding.BigEndianUnicode.GetString(bytes);
        }

        private static void ExtractTextOperators(string content, Dictionary<string, string> cmap, StringBuilder sb)
        {
            int i = 0;
            int len = content.Length;
            bool inText = false;
            StringBuilder currentLine = new StringBuilder();

            Action flushLine = () =>
            {
                string lineStr = currentLine.ToString().Trim();
                if (!string.IsNullOrEmpty(lineStr))
                {
                    sb.AppendLine(lineStr);
                    currentLine.Clear();
                }
            };

            while (i < len)
            {
                char c = content[i];

                // Literal string (...)
                if (c == '(' && inText)
                {
                    string lit = ReadPdfLiteral(content, ref i);
                    SkipWhitespace(content, ref i);
                    if (MatchOp(content, i, "Tj") || MatchOp(content, i, "'") || MatchOp(content, i, "\""))
                    {
                        if (MatchOp(content, i, "'") || MatchOp(content, i, "\""))
                            flushLine();
                        currentLine.Append(lit);
                    }
                    continue;
                }

                // Hex string <...>
                if (c == '<' && i + 1 < len && content[i + 1] != '<' && inText)
                {
                    string hexStr = ReadPdfHex(content, ref i);
                    SkipWhitespace(content, ref i);
                    if (MatchOp(content, i, "Tj"))
                    {
                        currentLine.Append(DecodeHexTokens(hexStr, cmap));
                    }
                    continue;
                }

                // Array [...] TJ
                if (c == '[' && inText)
                {
                    int arrStart = i + 1;
                    StringBuilder arrText = new StringBuilder();
                    i++;
                    while (i < len && content[i] != ']')
                    {
                        if (content[i] == '(')
                        {
                            arrText.Append(ReadPdfLiteral(content, ref i));
                        }
                        else if (content[i] == '<')
                        {
                            string hx = ReadPdfHex(content, ref i);
                            arrText.Append(DecodeHexTokens(hx, cmap));
                        }
                        else if (content[i] == '-' || char.IsDigit(content[i]))
                        {
                            int nStart = i;
                            i++;
                            while (i < len && (char.IsDigit(content[i]) || content[i] == '.')) i++;
                            double kern;
                            if (double.TryParse(content.Substring(nStart, i - nStart), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out kern))
                            {
                                if (kern <= -140) arrText.Append(' ');
                            }
                        }
                        else
                        {
                            i++;
                        }
                    }
                    if (i < len && content[i] == ']') i++;
                    SkipWhitespace(content, ref i);
                    if (MatchOp(content, i, "TJ"))
                    {
                        currentLine.Append(arrText.ToString());
                    }
                    continue;
                }

                // Tokens / Operators
                if (char.IsLetter(c) || c == '*')
                {
                    int tStart = i;
                    while (i < len && (char.IsLetterOrDigit(content[i]) || content[i] == '*')) i++;
                    string tok = content.Substring(tStart, i - tStart);

                    if (tok == "BT")
                    {
                        inText = true;
                    }
                    else if (tok == "ET")
                    {
                        flushLine();
                        inText = false;
                    }
                    else if (inText && (tok == "T*" || tok == "Td" || tok == "TD" || tok == "Tm"))
                    {
                        if (currentLine.Length > 0 && currentLine[currentLine.Length - 1] != ' ')
                            currentLine.Append(' ');
                        if (tok == "T*" || tok == "TD" || tok == "Tm")
                            flushLine();
                    }
                    continue;
                }

                i++;
            }

            flushLine();
        }

        private static string ReadPdfLiteral(string s, ref int i)
        {
            i++; // skip '('
            List<byte> bytes = new List<byte>();
            int depth = 1;
            while (i < s.Length && depth > 0)
            {
                char ch = s[i++];
                if (ch == '\\' && i < s.Length)
                {
                    char esc = s[i++];
                    if (esc == 'n') bytes.Add((byte)'\n');
                    else if (esc == 'r') bytes.Add((byte)'\r');
                    else if (esc == 't') bytes.Add((byte)'\t');
                    else if (esc == 'b') bytes.Add((byte)'\b');
                    else if (esc == 'f') bytes.Add((byte)'\f');
                    else if (esc == '(' || esc == ')' || esc == '\\') bytes.Add((byte)esc);
                    else if (esc >= '0' && esc <= '7')
                    {
                        string oct = "" + esc;
                        for (int k = 0; k < 2 && i < s.Length && s[i] >= '0' && s[i] <= '7'; k++)
                            oct += s[i++];
                        bytes.Add((byte)Convert.ToInt32(oct, 8));
                    }
                    else if (esc == '\r' || esc == '\n') { }
                    else bytes.Add((byte)esc);
                }
                else if (ch == '(')
                {
                    depth++;
                    bytes.Add((byte)'(');
                }
                else if (ch == ')')
                {
                    depth--;
                    if (depth > 0) bytes.Add((byte)')');
                }
                else
                {
                    bytes.Add((byte)ch);
                }
            }
            byte[] arr = bytes.ToArray();
            if (arr.Length >= 2 && arr[0] == 0xFE && arr[1] == 0xFF)
                return Encoding.BigEndianUnicode.GetString(arr, 2, arr.Length - 2);
            return Encoding.GetEncoding(1252).GetString(arr);
        }

        private static string ReadPdfHex(string s, ref int i)
        {
            i++; // skip '<'
            StringBuilder hx = new StringBuilder();
            while (i < s.Length && s[i] != '>')
            {
                char ch = s[i++];
                if (!char.IsWhiteSpace(ch)) hx.Append(ch);
            }
            if (i < s.Length && s[i] == '>') i++;
            return hx.ToString().ToUpperInvariant();
        }

        private static string DecodeHexTokens(string hex, Dictionary<string, string> cmap)
        {
            if (string.IsNullOrEmpty(hex)) return "";
            StringBuilder outSb = new StringBuilder();

            if (cmap.Count > 0)
            {
                // Try 4-hex-digit (2-byte CID) lookup first, then 2-hex-digit (1-byte)
                if (hex.Length % 4 == 0)
                {
                    bool allMatched4 = true;
                    StringBuilder try4 = new StringBuilder();
                    for (int k = 0; k < hex.Length; k += 4)
                    {
                        string code = hex.Substring(k, 4);
                        string val;
                        if (cmap.TryGetValue(code, out val))
                            try4.Append(val);
                        else
                        {
                            allMatched4 = false;
                            break;
                        }
                    }
                    if (allMatched4) return try4.ToString();
                }

                if (hex.Length % 2 == 0)
                {
                    bool anyMatched = false;
                    StringBuilder try2 = new StringBuilder();
                    for (int k = 0; k < hex.Length; k += 2)
                    {
                        string code = hex.Substring(k, 2);
                        string val;
                        if (cmap.TryGetValue(code, out val))
                        {
                            try2.Append(val);
                            anyMatched = true;
                        }
                        else if (k + 4 <= hex.Length && cmap.TryGetValue(hex.Substring(k, 4), out val))
                        {
                            try2.Append(val);
                            k += 2;
                            anyMatched = true;
                        }
                        else
                        {
                            byte b = Convert.ToByte(code, 16);
                            if (b >= 32) try2.Append(Encoding.GetEncoding(1252).GetString(new byte[] { b }));
                        }
                    }
                    if (anyMatched) return try2.ToString();
                }
            }

            // Direct WinAnsi fallback
            for (int k = 0; k + 1 < hex.Length; k += 2)
            {
                byte b = Convert.ToByte(hex.Substring(k, 2), 16);
                if (b >= 32)
                    outSb.Append(Encoding.GetEncoding(1252).GetString(new byte[] { b }));
            }
            return outSb.ToString();
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        private static bool MatchOp(string s, int i, string op)
        {
            if (i + op.Length > s.Length) return false;
            if (s.Substring(i, op.Length) != op) return false;
            if (i + op.Length == s.Length) return true;
            char next = s[i + op.Length];
            return char.IsWhiteSpace(next) || next == '(' || next == '[' || next == '<' || next == '/';
        }
    }

    // =========================================================================
    // PURE C# NATIVE PDF 1.4 VECTOR/TEXT/IMAGE GENERATOR FALLBACK
    // =========================================================================
    static class NativePdfBuilder
    {
        public static byte[] BuildPdf(Dictionary<string, object> data)
        {
            string docType = GetS(data, "docType");
            string primaryHex = GetS(data, "primaryHex").TrimStart('#');
            string secondaryHex = GetS(data, "secondaryHex").TrimStart('#');
            string tintHex = GetS(data, "tintHex").TrimStart('#');
            if (string.IsNullOrEmpty(primaryHex)) primaryHex = "1B365D";
            if (string.IsNullOrEmpty(secondaryHex)) secondaryHex = "2B547E";
            if (string.IsNullOrEmpty(tintHex)) tintHex = "F0F4F8";

            string countryCode = GetS(data, "countryCode").ToUpperInvariant();
            bool includePhoto = data.ContainsKey("includePhoto") && Convert.ToBoolean(data["includePhoto"]);
            string photoUri = GetS(data, "photoDataUri");

            byte[] jpgBytes = null;
            int jpgW = 0, jpgH = 0;
            if (includePhoto && docType == "cv" && !string.IsNullOrEmpty(photoUri) && photoUri.Contains("base64,"))
            {
                try
                {
                    string b64 = photoUri.Substring(photoUri.IndexOf("base64,") + 7);
                    byte[] rawImg = Convert.FromBase64String(b64);
                    using (MemoryStream ims = new MemoryStream(rawImg))
                    using (Image img = Image.FromStream(ims))
                    using (MemoryStream jms = new MemoryStream())
                    {
                        jpgW = img.Width;
                        jpgH = img.Height;
                        img.Save(jms, System.Drawing.Imaging.ImageFormat.Jpeg);
                        jpgBytes = jms.ToArray();
                    }
                }
                catch { jpgBytes = null; }
            }

            List<StringBuilder> pages = new List<StringBuilder>();
            pages.Add(new StringBuilder());
            int curPage = 0;
            double pageW = 595.0;
            double pageH = 842.0;
            double marginX = 46.0;
            double usableW = pageW - 2 * marginX;
            double y = pageH - 48.0;

            Action ensureSpace = () =>
            {
                if (y < 60.0)
                {
                    pages.Add(new StringBuilder());
                    curPage++;
                    y = pageH - 50.0;
                }
            };

            Action<double> needSpace = (needed) =>
            {
                if (y - needed < 56.0)
                {
                    pages.Add(new StringBuilder());
                    curPage++;
                    y = pageH - 50.0;
                }
            };

            string pCol = HexToPdfRgb(primaryHex);
            string sCol = HexToPdfRgb(secondaryHex);
            string tCol = HexToPdfRgb(tintHex);

            string fullName = GetS(data, "fullName");
            string headline = GetS(data, "headline");
            string contactLine = GetS(data, "contactLine");
            string personalMeta = GetS(data, "personalMetaLine");

            if (docType == "coverLetter")
            {
                DrawTextLine(pages[curPage], fullName, marginX, y, "F2", 19, pCol); y -= 22;
                if (!string.IsNullOrWhiteSpace(headline))
                {
                    DrawTextLine(pages[curPage], headline, marginX, y, "F2", 11.5, sCol); y -= 16;
                }
                if (!string.IsNullOrWhiteSpace(contactLine))
                {
                    DrawWrapped(pages, ref curPage, ref y, contactLine, marginX, usableW, "F1", 9.5, "0.22 0.25 0.3", 13);
                }
                y -= 4;
                DrawLine(pages[curPage], marginX, y, pageW - marginX, y, pCol, 1.8);
                y -= 24;

                string dateLine = GetS(data, "dateLine");
                if (!string.IsNullOrWhiteSpace(dateLine))
                {
                    bool rightDate = (countryCode == "DE" || countryCode == "CH" || countryCode == "FR");
                    double dx = rightDate ? Math.Max(marginX, pageW - marginX - dateLine.Length * 5.2) : marginX;
                    DrawTextLine(pages[curPage], dateLine, dx, y, "F1", 10, "0.28 0.32 0.38");
                    y -= 20;
                }

                string recipient = GetS(data, "recipientBlock");
                if (!string.IsNullOrWhiteSpace(recipient))
                {
                    foreach (string rl in recipient.Replace("\r\n", "\n").Split('\n'))
                    {
                        if (!string.IsNullOrWhiteSpace(rl))
                        {
                            DrawTextLine(pages[curPage], rl.Trim(), marginX, y, "F1", 10.5, "0.12 0.14 0.18");
                            y -= 14;
                        }
                    }
                    y -= 10;
                }

                string subj = GetS(data, "subjectLine");
                if (!string.IsNullOrWhiteSpace(subj))
                {
                    DrawWrapped(pages, ref curPage, ref y, subj, marginX, usableW, "F2", 12, pCol, 16);
                    y -= 8;
                }

                string sal = GetS(data, "salutation");
                if (!string.IsNullOrWhiteSpace(sal))
                {
                    DrawTextLine(pages[curPage], sal, marginX, y, "F2", 10.8, "0.08 0.1 0.12");
                    y -= 18;
                }

                string bodyText = GetS(data, "bodyText");
                foreach (string para in bodyText.Replace("\r\n", "\n").Split(new string[] { "\n\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
                {
                    if (!string.IsNullOrWhiteSpace(para))
                    {
                        DrawWrapped(pages, ref curPage, ref y, para.Trim(), marginX, usableW, "F1", 10.5, "0.12 0.16 0.22", 15);
                        y -= 8;
                    }
                }

                y -= 10;
                needSpace(45);
                string signOff = GetS(data, "signOff");
                if (!string.IsNullOrWhiteSpace(signOff))
                {
                    DrawTextLine(pages[curPage], signOff, marginX, y, "F1", 10.5, "0.08 0.1 0.12");
                    y -= 20;
                }
                DrawTextLine(pages[curPage], fullName, marginX, y, "F2", 12, pCol);
            }
            else
            {
                double headerTextW = jpgBytes != null ? usableW - 95 : usableW;
                double headerStartY = y;

                if (jpgBytes != null)
                {
                    double imgW = 74.0;
                    double imgH = 94.0;
                    double imgX = pageW - marginX - imgW;
                    double imgY = y - imgH + 14;
                    pages[curPage].AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                        "q {0:F2} 0 0 {1:F2} {2:F2} {3:F2} cm /Im1 Do Q", imgW, imgH, imgX, imgY));
                    pages[curPage].AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                        "{0} RG 1.2 w {1:F2} {2:F2} {3:F2} {4:F2} re S", pCol, imgX, imgY, imgW, imgH));
                }

                DrawTextLine(pages[curPage], fullName, marginX, y, "F2", 20, pCol); y -= 22;
                if (!string.IsNullOrWhiteSpace(headline))
                {
                    DrawWrapped(pages, ref curPage, ref y, headline, marginX, headerTextW, "F2", 12, sCol, 15);
                }
                if (!string.IsNullOrWhiteSpace(contactLine))
                {
                    DrawWrapped(pages, ref curPage, ref y, contactLine, marginX, headerTextW, "F1", 9.5, "0.22 0.25 0.3", 13);
                }
                if (!string.IsNullOrWhiteSpace(personalMeta))
                {
                    DrawWrapped(pages, ref curPage, ref y, personalMeta, marginX, headerTextW, "F1", 9, "0.3 0.34 0.4", 12);
                }
                if (jpgBytes != null)
                {
                    y = Math.Min(y, headerStartY - 88);
                }
                y -= 4;
                DrawLine(pages[curPage], marginX, y, pageW - marginX, y, pCol, 2.0);
                y -= 18;

                string summary = GetS(data, "summary");
                if (!string.IsNullOrWhiteSpace(summary))
                {
                    DrawSectionBar(pages, ref curPage, ref y, "EXECUTIVE PROFILE", marginX, usableW, pCol, tCol, countryCode);
                    DrawWrapped(pages, ref curPage, ref y, summary, marginX, usableW, "F1", 10, "0.12 0.16 0.22", 14);
                    y -= 8;
                }

                if (data.ContainsKey("experience") && data["experience"] is ArrayList)
                {
                    ArrayList expList = (ArrayList)data["experience"];
                    if (expList.Count > 0)
                    {
                        DrawSectionBar(pages, ref curPage, ref y, "PROFESSIONAL EXPERIENCE", marginX, usableW, pCol, tCol, countryCode);
                        foreach (object item in expList)
                        {
                            var exp = item as Dictionary<string, object>;
                            if (exp == null) continue;
                            needSpace(36);
                            string role = GetS(exp, "role");
                            string company = GetS(exp, "company");
                            string loc = GetS(exp, "location");
                            string period = GetS(exp, "period");
                            string left = role + (string.IsNullOrWhiteSpace(company) ? "" : " - " + company) + (string.IsNullOrWhiteSpace(loc) ? "" : " (" + loc + ")");

                            DrawTextLine(pages[curPage], period, Math.Max(marginX + 260, pageW - marginX - period.Length * 5.2), y, "F2", 9.5, sCol);
                            DrawWrapped(pages, ref curPage, ref y, left, marginX, usableW - 125, "F2", 10.5, "0.07 0.09 0.14", 14);

                            if (exp.ContainsKey("bullets") && exp["bullets"] is ArrayList)
                            {
                                foreach (object b in (ArrayList)exp["bullets"])
                                {
                                    string bt = Convert.ToString(b ?? "").Trim();
                                    if (!string.IsNullOrEmpty(bt))
                                    {
                                        DrawWrapped(pages, ref curPage, ref y, "• " + bt, marginX + 10, usableW - 10, "F1", 9.8, "0.14 0.17 0.22", 13.5);
                                    }
                                }
                            }
                            y -= 6;
                        }
                    }
                }

                if (data.ContainsKey("education") && data["education"] is ArrayList)
                {
                    ArrayList eduList = (ArrayList)data["education"];
                    if (eduList.Count > 0)
                    {
                        DrawSectionBar(pages, ref curPage, ref y, "EDUCATION & QUALIFICATIONS", marginX, usableW, pCol, tCol, countryCode);
                        foreach (object item in eduList)
                        {
                            var edu = item as Dictionary<string, object>;
                            if (edu == null) continue;
                            needSpace(30);
                            string deg = GetS(edu, "degree");
                            string inst = GetS(edu, "institution");
                            string period = GetS(edu, "period");
                            string details = GetS(edu, "details");
                            string left = deg + (string.IsNullOrWhiteSpace(inst) ? "" : " | " + inst);

                            DrawTextLine(pages[curPage], period, Math.Max(marginX + 280, pageW - marginX - period.Length * 5.2), y, "F2", 9.5, sCol);
                            DrawWrapped(pages, ref curPage, ref y, left, marginX, usableW - 110, "F2", 10.2, "0.07 0.09 0.14", 13.5);
                            if (!string.IsNullOrWhiteSpace(details))
                                DrawWrapped(pages, ref curPage, ref y, details, marginX, usableW, "F1", 9.5, "0.22 0.25 0.3", 13);
                            y -= 4;
                        }
                    }
                }

                if (data.ContainsKey("skills") && data["skills"] is ArrayList)
                {
                    ArrayList skills = (ArrayList)data["skills"];
                    if (skills.Count > 0)
                    {
                        DrawSectionBar(pages, ref curPage, ref y, "CORE COMPETENCIES & TECHNICAL SKILLS", marginX, usableW, pCol, tCol, countryCode);
                        List<string> sk = new List<string>();
                        foreach (object s in skills)
                        {
                            string st = Convert.ToString(s ?? "").Trim();
                            if (!string.IsNullOrEmpty(st)) sk.Add(st);
                        }
                        DrawWrapped(pages, ref curPage, ref y, string.Join("  •  ", sk.ToArray()), marginX, usableW, "F1", 9.8, "0.12 0.16 0.22", 14);
                        y -= 6;
                    }
                }

                string langs = GetS(data, "languagesLine");
                string addInfo = GetS(data, "additionalInfo");
                if (!string.IsNullOrWhiteSpace(langs) || !string.IsNullOrWhiteSpace(addInfo))
                {
                    DrawSectionBar(pages, ref curPage, ref y, "LANGUAGES & ADDITIONAL INFORMATION", marginX, usableW, pCol, tCol, countryCode);
                    if (!string.IsNullOrWhiteSpace(langs))
                        DrawWrapped(pages, ref curPage, ref y, "Languages: " + langs, marginX, usableW, "F1", 9.8, "0.12 0.16 0.22", 13.5);
                    if (!string.IsNullOrWhiteSpace(addInfo))
                        DrawWrapped(pages, ref curPage, ref y, addInfo, marginX, usableW, "F1", 9.8, "0.18 0.22 0.28", 13.5);
                }

                string sig = GetS(data, "signatureLine");
                if (!string.IsNullOrWhiteSpace(sig))
                {
                    y -= 14;
                    needSpace(25);
                    DrawLine(pages[curPage], marginX, y + 12, pageW - marginX, y + 12, "0.8 0.83 0.88", 0.6);
                    DrawTextLine(pages[curPage], sig, marginX, y, "F3", 9.5, "0.3 0.34 0.4");
                }
            }

            return AssemblePdfObjects(pages, jpgBytes, jpgW, jpgH);
        }

        private static byte[] AssemblePdfObjects(List<StringBuilder> pageContents, byte[] jpgBytes, int jpgW, int jpgH)
        {
            List<byte[]> objects = new List<byte[]>();

            // Obj 1: Catalog (placeholder -> replaced after knowing Pages id)
            // Layout:
            // 1: Catalog
            // 2: Pages
            // 3: Font F1 (Helvetica)
            // 4: Font F2 (Helvetica-Bold)
            // 5: Font F3 (Helvetica-Oblique)
            // 6: Optional Image Im1 (if jpgBytes != null)
            // Following pairs: Page + Content stream

            int firstPageObjId = jpgBytes != null ? 7 : 6;
            List<int> pageIds = new List<int>();
            for (int i = 0; i < pageContents.Count; i++)
                pageIds.Add(firstPageObjId + i * 2);

            StringBuilder kidsSb = new StringBuilder();
            foreach (int pid in pageIds) kidsSb.Append(pid + " 0 R ");

            objects.Add(Encoding.ASCII.GetBytes("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
            objects.Add(Encoding.ASCII.GetBytes("2 0 obj\n<< /Type /Pages /Kids [ " + kidsSb + "] /Count " + pageIds.Count + " >>\nendobj\n"));
            objects.Add(Encoding.ASCII.GetBytes("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n"));
            objects.Add(Encoding.ASCII.GetBytes("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n"));
            objects.Add(Encoding.ASCII.GetBytes("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n"));

            if (jpgBytes != null)
            {
                string imgHead = "6 0 obj\n<< /Type /XObject /Subtype /Image /Width " + jpgW + " /Height " + jpgH + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpgBytes.Length + " >>\nstream\n";
                byte[] hBytes = Encoding.ASCII.GetBytes(imgHead);
                byte[] fBytes = Encoding.ASCII.GetBytes("\nendstream\nendobj\n");
                byte[] fullImg = new byte[hBytes.Length + jpgBytes.Length + fBytes.Length];
                Buffer.BlockCopy(hBytes, 0, fullImg, 0, hBytes.Length);
                Buffer.BlockCopy(jpgBytes, 0, fullImg, hBytes.Length, jpgBytes.Length);
                Buffer.BlockCopy(fBytes, 0, fullImg, hBytes.Length + jpgBytes.Length, fBytes.Length);
                objects.Add(fullImg);
            }

            string xobjRef = jpgBytes != null ? " /XObject << /Im1 6 0 R >>" : "";
            for (int i = 0; i < pageContents.Count; i++)
            {
                int pObjId = firstPageObjId + i * 2;
                int cObjId = pObjId + 1;

                objects.Add(Encoding.ASCII.GetBytes(pObjId + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>" + xobjRef + " >> /Contents " + cObjId + " 0 R >>\nendobj\n"));

                byte[] streamBytes = Encoding.GetEncoding(1252).GetBytes(pageContents[i].ToString());
                string cHead = cObjId + " 0 obj\n<< /Length " + streamBytes.Length + " >>\nstream\n";
                byte[] ch = Encoding.ASCII.GetBytes(cHead);
                byte[] cf = Encoding.ASCII.GetBytes("\nendstream\nendobj\n");
                byte[] fullStream = new byte[ch.Length + streamBytes.Length + cf.Length];
                Buffer.BlockCopy(ch, 0, fullStream, 0, ch.Length);
                Buffer.BlockCopy(streamBytes, 0, fullStream, ch.Length, streamBytes.Length);
                Buffer.BlockCopy(cf, 0, fullStream, ch.Length + streamBytes.Length, cf.Length);
                objects.Add(fullStream);
            }

            using (MemoryStream ms = new MemoryStream())
            {
                byte[] header = new byte[] { (byte)'%', (byte)'P', (byte)'D', (byte)'F', (byte)'-', (byte)'1', (byte)'.', (byte)'4', (byte)'\n', (byte)'%', 0xE2, 0xE3, 0xCF, 0xD3, (byte)'\n' };
                ms.Write(header, 0, header.Length);

                List<long> offsets = new List<long>();
                foreach (byte[] obj in objects)
                {
                    offsets.Add(ms.Position);
                    ms.Write(obj, 0, obj.Length);
                }

                long xrefPos = ms.Position;
                StringBuilder xref = new StringBuilder();
                xref.Append("xref\n0 " + (objects.Count + 1) + "\n0000000000 65535 f \n");
                foreach (long off in offsets)
                    xref.Append(off.ToString("D10") + " 00000 n \n");

                xref.Append("trailer\n<< /Size " + (objects.Count + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n");
                byte[] xBytes = Encoding.ASCII.GetBytes(xref.ToString());
                ms.Write(xBytes, 0, xBytes.Length);
                return ms.ToArray();
            }
        }

        private static void DrawSectionBar(List<StringBuilder> pages, ref int curPage, ref double y, string title, double x, double w, string pCol, string tCol, string countryCode)
        {
            if (y < 90)
            {
                pages.Add(new StringBuilder());
                curPage++;
                y = 792;
            }
            if (countryCode == "DE" || countryCode == "CH" || countryCode == "AT")
            {
                pages[curPage].AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                    "{0} rg {1:F2} {2:F2} {3:F2} 16 re f", tCol, x, y - 4, w));
                pages[curPage].AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                    "{0} rg {1:F2} {2:F2} 3.5 16 re f", pCol, x, y - 4));
                DrawTextLine(pages[curPage], title, x + 8, y, "F2", 10, pCol);
                y -= 18;
            }
            else
            {
                DrawTextLine(pages[curPage], title, x, y, "F2", 10, pCol);
                y -= 4;
                DrawLine(pages[curPage], x, y, x + w, y, pCol, 1.1);
                y -= 14;
            }
        }

        private static void DrawWrapped(List<StringBuilder> pages, ref int curPage, ref double y, string text, double x, double maxW, string font, double size, string rgb, double lineH)
        {
            int maxChars = Math.Max(20, (int)(maxW / (size * 0.50)));
            List<string> lines = WrapLines(text, maxChars);
            foreach (string ln in lines)
            {
                if (y < 56)
                {
                    pages.Add(new StringBuilder());
                    curPage++;
                    y = 792;
                }
                DrawTextLine(pages[curPage], ln, x, y, font, size, rgb);
                y -= lineH;
            }
        }

        private static List<string> WrapLines(string text, int maxChars)
        {
            List<string> outLines = new List<string>();
            if (string.IsNullOrEmpty(text)) return outLines;
            string[] words = text.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            StringBuilder cur = new StringBuilder();
            foreach (string w in words)
            {
                if (cur.Length == 0)
                {
                    cur.Append(w);
                }
                else if (cur.Length + 1 + w.Length <= maxChars)
                {
                    cur.Append(' ').Append(w);
                }
                else
                {
                    outLines.Add(cur.ToString());
                    cur.Clear();
                    cur.Append(w);
                }
            }
            if (cur.Length > 0) outLines.Add(cur.ToString());
            return outLines;
        }

        private static void DrawTextLine(StringBuilder sb, string text, double x, double y, string font, double size, string rgb)
        {
            if (string.IsNullOrEmpty(text)) return;
            sb.AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                "BT /{0} {1:F1} Tf {2} rg {3:F2} {4:F2} Td ({5}) Tj ET",
                font, size, rgb, x, y, EscapePdfStr(text)));
        }

        private static void DrawLine(StringBuilder sb, double x1, double y1, double x2, double y2, string rgb, double width)
        {
            sb.AppendLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                "{0} RG {1:F2} w {2:F2} {3:F2} m {4:F2} {5:F2} l S", rgb, width, x1, y1, x2, y2));
        }

        private static string EscapePdfStr(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
        }

        private static string HexToPdfRgb(string hex)
        {
            if (string.IsNullOrEmpty(hex) || hex.Length < 6) return "0.11 0.21 0.36";
            try
            {
                int r = Convert.ToInt32(hex.Substring(0, 2), 16);
                int g = Convert.ToInt32(hex.Substring(2, 2), 16);
                int b = Convert.ToInt32(hex.Substring(4, 2), 16);
                return string.Format(System.Globalization.CultureInfo.InvariantCulture, "{0:F3} {1:F3} {2:F3}", r / 255.0, g / 255.0, b / 255.0);
            }
            catch { return "0.11 0.21 0.36"; }
        }

        private static string GetS(Dictionary<string, object> d, string key)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
                return Convert.ToString(d[key]);
            return "";
        }
    }
}
