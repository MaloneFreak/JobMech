// JobMech 2 - host services exposed to the UI: storage, secrets, HTTP, dialogs, system info.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace JobMech
{
    sealed class Services
    {
        public static readonly JavaScriptSerializer Json = CreateJson();

        private readonly MainForm form;
        private readonly Secrets secrets;
        private readonly object httpGate = new object();
        private readonly Dictionary<string, HttpWebRequest> activeHttp = new Dictionary<string, HttpWebRequest>();
        private readonly HashSet<string> approvedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> approvedDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> approvedSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        public Services(MainForm form)
        {
            this.form = form;
            secrets = new Secrets(Path.Combine(Program.DataDir, "secrets.dat"));
        }

        private static JavaScriptSerializer CreateJson()
        {
            JavaScriptSerializer j = new JavaScriptSerializer();
            j.MaxJsonLength = int.MaxValue;
            j.RecursionLimit = 256;
            return j;
        }

        // ------------------------------------------------------------ small parameter helpers

        public static string S(Dictionary<string, object> d, string key) { return S(d, key, ""); }

        public static string S(Dictionary<string, object> d, string key, string fallback)
        {
            object v;
            if (d != null && d.TryGetValue(key, out v) && v != null) return Convert.ToString(v);
            return fallback;
        }

        public static bool B(Dictionary<string, object> d, string key, bool fallback)
        {
            object v;
            if (d != null && d.TryGetValue(key, out v) && v != null)
            {
                try { return Convert.ToBoolean(v); } catch { }
            }
            return fallback;
        }

        public static double D(Dictionary<string, object> d, string key, double fallback)
        {
            object v;
            if (d != null && d.TryGetValue(key, out v) && v != null)
            {
                try { return Convert.ToDouble(v, System.Globalization.CultureInfo.InvariantCulture); } catch { }
            }
            return fallback;
        }

        private static Dictionary<string, object> Obj(params object[] pairs)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            for (int i = 0; i + 1 < pairs.Length; i += 2) d[Convert.ToString(pairs[i])] = pairs[i + 1];
            return d;
        }

        // ------------------------------------------------------------ dispatcher (UI thread)

        public object Handle(string method, Dictionary<string, object> p)
        {
            switch (method)
            {
                case "app.info": return AppInfo();
                case "app.quit": form.BeginInvoke((MethodInvoker)delegate { form.Close(); }); return true;
                case "app.reload": form.ReloadPage(); return true;
                case "app.devtools": form.OpenDevTools(); return true;

                case "store.read": return StoreRead(p);
                case "store.write": return StoreWrite(p);
                case "store.readBinary": return StoreReadBinary(p);
                case "store.writeBinary": return StoreWriteBinary(p);
                case "store.delete": return StoreDelete(p);
                case "store.list": return StoreList(p);
                case "store.exists": return File.Exists(DataPath(S(p, "path")));

                case "secrets.set": secrets.Set(S(p, "name"), S(p, "value"), S(p, "host")); return true;
                case "secrets.info": return secrets.Info(S(p, "name"));
                case "secrets.delete": secrets.Delete(S(p, "name")); return true;

                case "dialog.save": return DialogSave(p);
                case "dialog.open": return DialogOpen(p);
                case "dialog.folder": return DialogFolder(p);

                case "data.export": return DataExport(p);
                case "data.import": return DataImport(p);

                case "fs.write": return FsWrite(p);
                case "fs.exists": return File.Exists(S(p, "path")) || Directory.Exists(S(p, "path"));
                case "fs.reveal": return FsReveal(S(p, "path"));
                case "fs.open": return FsOpen(S(p, "path"));
                case "shell.open": OpenExternal(S(p, "url")); return true;

                case "window.theme": return WindowTheme(p);
                case "sys.hardware": return Hardware();
                case "ollama.find": return Obj("installed", FindOllama() != null);
                case "ollama.launch": return OllamaLaunch();
                case "ollama.install": return OllamaInstall();
                case "http.abort": HttpAbort(S(p, "reqId")); return true;

                case "log.write": Log.Write(S(p, "level", "UI"), S(p, "text")); return true;
            }
            throw new UserException("Unknown host method: " + method);
        }

        private object AppInfo()
        {
            return Obj(
                "version", Program.AppVersion,
                "dev", Program.DevMode,
                "baseDir", Program.BaseDir,
                "dataDir", Program.DataDir,
                "dataMode", Program.DataMode,
                "userDataDir", Program.UserDataDir,
                "downloadsDir", KnownFolders.Downloads(),
                "documentsDir", Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                "desktopDir", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "os", Environment.OSVersion.Version.ToString(),
                "locale", System.Globalization.CultureInfo.CurrentUICulture.Name);
        }

        // ------------------------------------------------------------ storage (inside the data folder only)

        private static string DataPath(string rel)
        {
            if (string.IsNullOrWhiteSpace(rel)) throw new UserException("Missing storage path.");
            rel = rel.Replace('/', '\\').TrimStart('\\');
            string full = Path.GetFullPath(Path.Combine(Program.DataDir, rel));
            if (!full.StartsWith(Program.DataDir + "\\", StringComparison.OrdinalIgnoreCase))
                throw new UserException("Storage path is outside the data folder.");
            if (full.StartsWith(Path.Combine(Program.DataDir, ".webview"), StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Path.GetFileName(full), "secrets.dat", StringComparison.OrdinalIgnoreCase))
                throw new UserException("That file is managed by JobMech.");
            return full;
        }

        private static void AtomicWrite(string path, byte[] bytes)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp-" + Guid.NewGuid().ToString("N").Substring(0, 8);
            File.WriteAllBytes(tmp, bytes);
            try
            {
                if (File.Exists(path)) File.Replace(tmp, path, null);
                else File.Move(tmp, path);
            }
            catch
            {
                try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                throw;
            }
        }

        private object StoreRead(Dictionary<string, object> p)
        {
            string path = DataPath(S(p, "path"));
            if (!File.Exists(path)) return Obj("exists", false, "text", "");
            return Obj("exists", true, "text", File.ReadAllText(path, Encoding.UTF8));
        }

        private object StoreWrite(Dictionary<string, object> p)
        {
            AtomicWrite(DataPath(S(p, "path")), new UTF8Encoding(false).GetBytes(S(p, "text")));
            return true;
        }

        private object StoreReadBinary(Dictionary<string, object> p)
        {
            string path = DataPath(S(p, "path"));
            if (!File.Exists(path)) return Obj("exists", false, "base64", "");
            return Obj("exists", true, "base64", Convert.ToBase64String(File.ReadAllBytes(path)));
        }

        private object StoreWriteBinary(Dictionary<string, object> p)
        {
            AtomicWrite(DataPath(S(p, "path")), Convert.FromBase64String(S(p, "base64")));
            return true;
        }

        private object StoreDelete(Dictionary<string, object> p)
        {
            string path = DataPath(S(p, "path"));
            if (File.Exists(path)) File.Delete(path);
            return true;
        }

        private object StoreList(Dictionary<string, object> p)
        {
            string dir = DataPath(S(p, "path"));
            List<object> items = new List<object>();
            if (!Directory.Exists(dir)) return items;
            foreach (string f in Directory.GetFiles(dir))
            {
                FileInfo fi = new FileInfo(f);
                items.Add(Obj("name", fi.Name, "size", fi.Length, "modified", fi.LastWriteTimeUtc.ToString("o")));
            }
            return items;
        }

        // ------------------------------------------------------------ window state

        public WindowState ReadWindowState()
        {
            WindowState ws = new WindowState();
            try
            {
                string f = Path.Combine(Program.DataDir, "window.json");
                if (File.Exists(f))
                {
                    Dictionary<string, object> d = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(f, Encoding.UTF8));
                    ws.X = (int)D(d, "x", 0); ws.Y = (int)D(d, "y", 0);
                    ws.W = (int)D(d, "w", 0); ws.H = (int)D(d, "h", 0);
                    ws.Maximized = B(d, "max", false);
                    ws.Dark = B(d, "dark", false);
                }
            }
            catch { }
            return ws;
        }

        public void WriteWindowState(WindowState ws)
        {
            try
            {
                string json = Json.Serialize(Obj("x", ws.X, "y", ws.Y, "w", ws.W, "h", ws.H, "max", ws.Maximized, "dark", ws.Dark));
                AtomicWrite(Path.Combine(Program.DataDir, "window.json"), new UTF8Encoding(false).GetBytes(json));
            }
            catch { }
        }

        private object WindowTheme(Dictionary<string, object> p)
        {
            bool dark = B(p, "dark", false);
            Color bg = ParseColor(S(p, "bg"), dark ? Color.FromArgb(0x12, 0x13, 0x15) : Color.FromArgb(0xF5, 0xF3, 0xEE));
            Color fg = ParseColor(S(p, "fg"), Color.Empty);
            form.ApplyCaptionTheme(dark, bg, fg);
            WindowState ws = ReadWindowState();
            if (ws.Dark != dark) { ws.Dark = dark; WriteWindowState(ws); }
            return true;
        }

        private static Color ParseColor(string hex, Color fallback)
        {
            try
            {
                hex = (hex ?? "").Trim().TrimStart('#');
                if (hex.Length == 6)
                    return Color.FromArgb(Convert.ToInt32(hex.Substring(0, 2), 16), Convert.ToInt32(hex.Substring(2, 2), 16), Convert.ToInt32(hex.Substring(4, 2), 16));
            }
            catch { }
            return fallback;
        }

        // ------------------------------------------------------------ dialogs and files the user chose

        private object DialogSave(Dictionary<string, object> p)
        {
            using (SaveFileDialog d = new SaveFileDialog())
            {
                string ext = S(p, "ext", "pdf").TrimStart('.');
                d.Title = S(p, "title", "Save");
                d.FileName = S(p, "defaultName", "Document." + ext);
                d.Filter = S(p, "filterName", ext.ToUpperInvariant() + " file") + " (*." + ext + ")|*." + ext;
                d.DefaultExt = ext;
                d.AddExtension = true;
                d.OverwritePrompt = true;
                string dir = S(p, "dir");
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) d.InitialDirectory = dir;
                if (d.ShowDialog(form) != DialogResult.OK) return Obj("cancelled", true);
                approvedFiles.Add(Path.GetFullPath(d.FileName));
                return Obj("cancelled", false, "path", d.FileName, "dir", Path.GetDirectoryName(d.FileName));
            }
        }

        private object DialogOpen(Dictionary<string, object> p)
        {
            using (OpenFileDialog d = new OpenFileDialog())
            {
                string ext = S(p, "ext", "zip").TrimStart('.');
                d.Title = S(p, "title", "Open");
                d.Filter = S(p, "filterName", ext.ToUpperInvariant() + " file") + " (*." + ext + ")|*." + ext;
                d.CheckFileExists = true;
                string dir = S(p, "dir");
                if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) d.InitialDirectory = dir;
                if (d.ShowDialog(form) != DialogResult.OK) return Obj("cancelled", true);
                approvedSources.Add(Path.GetFullPath(d.FileName));
                return Obj("cancelled", false, "path", d.FileName);
            }
        }

        private object DialogFolder(Dictionary<string, object> p)
        {
            string chosen = FolderPicker.Show(form.Handle, S(p, "title", "Choose a folder"), S(p, "dir"));
            if (string.IsNullOrEmpty(chosen)) return Obj("cancelled", true);
            approvedDirs.Add(Path.GetFullPath(chosen).TrimEnd('\\'));
            return Obj("cancelled", false, "path", chosen);
        }

        // ------------------------------------------------------------ backup and restore of the data folder

        private static readonly string[] DataMarkers = { "settings.json", "profile.json", "memory.md" };

        /// <summary>
        /// Parts of the data folder that belong to this PC or this Windows account and therefore
        /// stay out of a backup and survive a restore: the browser profile, logs, earlier safety
        /// copies, test output, the encrypted API keys and the window position.
        /// </summary>
        private static bool StaysLocal(string rel)
        {
            rel = rel.Replace('\\', '/').TrimStart('/');
            string first = rel.Split('/')[0].ToLowerInvariant();
            if (first == ".webview" || first == "logs" || first == "backups" || first == "dev-out") return true;
            string name = rel.Substring(rel.LastIndexOf('/') + 1).ToLowerInvariant();
            return name == "secrets.dat" || name == "window.json" || name == ".port" ||
                   name.Contains(".tmp-") || name.StartsWith(".write-test-") || name.EndsWith(".part");
        }

        private static bool HasData(string dir)
        {
            foreach (string m in DataMarkers) if (File.Exists(Path.Combine(dir, m))) return true;
            return false;
        }

        private static void CollectFiles(string root, string dir, List<string> into)
        {
            foreach (string f in Directory.GetFiles(dir))
            {
                string rel = f.Substring(root.Length + 1);
                if (!StaysLocal(rel)) into.Add(rel);
            }
            foreach (string d in Directory.GetDirectories(dir))
            {
                if (!StaysLocal(d.Substring(root.Length + 1) + "/x")) CollectFiles(root, d, into);
            }
        }

        private static int WriteBackup(string dataDir, string zipPath)
        {
            List<string> files = new List<string>();
            CollectFiles(dataDir, dataDir, files);
            Directory.CreateDirectory(Path.GetDirectoryName(zipPath));
            string tmp = zipPath + ".part";
            if (File.Exists(tmp)) File.Delete(tmp);
            using (FileStream fs = new FileStream(tmp, FileMode.CreateNew))
            using (ZipArchive zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                foreach (string rel in files)
                {
                    string full = Path.Combine(dataDir, rel);
                    ZipArchiveEntry e = zip.CreateEntry(rel.Replace('\\', '/'), CompressionLevel.Optimal);
                    e.LastWriteTime = File.GetLastWriteTime(full);
                    using (Stream es = e.Open())
                    using (FileStream src = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        src.CopyTo(es);
                }
            }
            if (File.Exists(zipPath)) File.Delete(zipPath);
            File.Move(tmp, zipPath);
            return files.Count;
        }

        private object DataExport(Dictionary<string, object> p)
        {
            string path = RequireWritable(S(p, "path"));
            int n;
            try { n = WriteBackup(Program.DataDir, path); }
            catch (IOException) { throw new UserException("The backup could not be written there. Choose another folder."); }
            catch (UnauthorizedAccessException) { throw new UserException("Windows did not allow saving to that folder. Choose another one."); }
            return Obj("path", path, "files", n, "size", new FileInfo(path).Length);
        }

        /// <summary>A backup file or another data folder may only be read after the user chose it in a dialog.</summary>
        private string RequireSource(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new UserException("Nothing was chosen.");
            string full = Path.GetFullPath(path).TrimEnd('\\');
            if (approvedSources.Contains(full) || approvedDirs.Contains(full)) return full;
            if (Program.DevMode && Program.CustomDataDir &&
                full.StartsWith(Path.Combine(Program.DataDir, "dev-out") + "\\", StringComparison.OrdinalIgnoreCase)) return full;
            throw new UserException("Choose the backup file or folder first.");
        }

        /// <summary>
        /// Replaces the data folder with the content of a backup file (.zip) or of another JobMech
        /// data folder (version 1 folders included: they are converted on the next start).
        /// The source is first copied completely to a temporary place and checked; what is in
        /// use now is saved to backups\ before anything is replaced.
        /// </summary>
        private object DataImport(Dictionary<string, object> p)
        {
            string src = RequireSource(S(p, "path"));
            string data = Program.DataDir;
            string stage = Path.Combine(Path.GetTempPath(), "jobmech-import-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(stage);
            string otherKeys = null;
            try
            {
                int staged = 0;
                if (Directory.Exists(src))
                {
                    string root = src;
                    if (!HasData(root) && HasData(Path.Combine(root, "data"))) root = Path.Combine(root, "data");
                    if (!HasData(root)) throw new UserException("That folder does not contain JobMech data. Choose the \"data\" folder of your other JobMech copy.");
                    if (string.Equals(Path.GetFullPath(root).TrimEnd('\\'), data, StringComparison.OrdinalIgnoreCase))
                        throw new UserException("That is the folder JobMech is already using.");
                    if (File.Exists(Path.Combine(root, "secrets.dat"))) otherKeys = Path.Combine(root, "secrets.dat");
                    List<string> files = new List<string>();
                    CollectFiles(root, root, files);
                    foreach (string rel in files)
                    {
                        string dest = Path.Combine(stage, rel);
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        File.Copy(Path.Combine(root, rel), dest, true);
                        staged++;
                    }
                }
                else if (File.Exists(src))
                {
                    try
                    {
                        using (ZipArchive zip = ZipFile.OpenRead(src))
                        {
                            // the data may sit at the top of the archive or inside one folder of it
                            string prefix = null;
                            foreach (ZipArchiveEntry e in zip.Entries)
                            {
                                string name = e.FullName.Replace('\\', '/');
                                string file = name.Substring(name.LastIndexOf('/') + 1).ToLowerInvariant();
                                if (Array.IndexOf(DataMarkers, file) < 0) continue;
                                string dir = name.Substring(0, name.Length - file.Length);
                                if (prefix == null || dir.Length < prefix.Length) prefix = dir;
                            }
                            if (prefix == null) throw new UserException("This file does not contain JobMech data.");
                            string stageRoot = stage + "\\";
                            foreach (ZipArchiveEntry e in zip.Entries)
                            {
                                string name = e.FullName.Replace('\\', '/');
                                if (!name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || name.EndsWith("/")) continue;
                                string rel = name.Substring(prefix.Length);
                                if (rel.Length == 0 || StaysLocal(rel)) continue;
                                string dest = Path.GetFullPath(Path.Combine(stage, rel.Replace('/', '\\')));
                                if (!dest.StartsWith(stageRoot, StringComparison.OrdinalIgnoreCase)) continue;   // never write outside
                                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                                using (Stream es = e.Open())
                                using (FileStream fs = new FileStream(dest, FileMode.Create))
                                    es.CopyTo(fs);
                                staged++;
                            }
                        }
                    }
                    catch (InvalidDataException) { throw new UserException("This file is not a readable backup."); }
                }
                else throw new UserException("That file or folder is no longer there.");

                if (staged == 0 || !HasData(stage)) throw new UserException("Nothing usable was found there.");

                // keep what is in use now, then replace it
                string safety = "";
                if (HasData(data))
                {
                    string dir = Path.Combine(data, "backups");
                    string stamp = "before-restore-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
                    safety = Path.Combine(dir, stamp + ".zip");
                    for (int i = 2; File.Exists(safety); i++) safety = Path.Combine(dir, stamp + "-" + i + ".zip");
                    WriteBackup(data, safety);
                    string[] old = Directory.GetFiles(dir, "before-restore-*.zip");
                    Array.Sort(old);
                    for (int i = 0; i < old.Length - 5; i++) { try { File.Delete(old[i]); } catch { } }
                }
                List<string> current = new List<string>();
                CollectFiles(data, data, current);
                foreach (string rel in current) File.Delete(Path.Combine(data, rel));
                foreach (string d in Directory.GetDirectories(data))
                {
                    if (StaysLocal(d.Substring(data.Length + 1) + "/x")) continue;
                    try { Directory.Delete(d, true); } catch { }
                }
                List<string> incoming = new List<string>();
                CollectFiles(stage, stage, incoming);
                foreach (string rel in incoming)
                {
                    string dest = Path.Combine(data, rel);
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    File.Copy(Path.Combine(stage, rel), dest, true);
                }
                // Another copy on this PC: its saved API keys come along, as far as none is saved here
                // under the same name. Keys of another Windows account cannot be read and are left out.
                int keys = otherKeys != null ? secrets.AdoptFrom(otherKeys) : 0;
                Log.Write("INFO", "Data replaced from " + (Directory.Exists(src) ? "a folder" : "a backup file") + ": " + incoming.Count + " files, " + keys + " API keys.");
                return Obj("files", incoming.Count, "safety", safety, "keys", keys);
            }
            catch (UserException) { throw; }
            catch (IOException ex) { throw new UserException("The data could not be copied: " + ex.Message); }
            catch (UnauthorizedAccessException) { throw new UserException("Windows did not allow reading that file or folder."); }
            finally
            {
                try { Directory.Delete(stage, true); } catch { }
            }
        }

        /// <summary>Files may only be written where the user pointed a dialog during this session.</summary>
        public string RequireWritable(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new UserException("No file name was given.");
            string full = Path.GetFullPath(path);
            string dir = (Path.GetDirectoryName(full) ?? "").TrimEnd('\\');
            if (approvedFiles.Contains(full) || approvedDirs.Contains(dir)) return full;
            // Automated tests (--dev with a scratch data folder) may write into <data>\dev-out without a dialog.
            if (Program.DevMode && Program.CustomDataDir &&
                dir.StartsWith(Path.Combine(Program.DataDir, "dev-out"), StringComparison.OrdinalIgnoreCase))
            {
                Directory.CreateDirectory(dir);
                return full;
            }
            throw new UserException("Choose where to save the file first.");
        }

        private object FsWrite(Dictionary<string, object> p)
        {
            string path = RequireWritable(S(p, "path"));
            byte[] bytes = Convert.FromBase64String(S(p, "base64"));
            try
            {
                AtomicWrite(path, bytes);
            }
            catch (IOException)
            {
                throw new UserException("\"" + Path.GetFileName(path) + "\" is open in another program. Close it and save again.");
            }
            catch (UnauthorizedAccessException)
            {
                throw new UserException("Windows did not allow saving to that folder. Choose another one.");
            }
            return Obj("path", path, "size", bytes.Length);
        }

        private object FsReveal(string path)
        {
            if (File.Exists(path))
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\""));
            else if (Directory.Exists(path))
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + path + "\""));
            else
                throw new UserException("That file is no longer there.");
            return true;
        }

        private object FsOpen(string path)
        {
            if (Directory.Exists(path))
            {
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + path + "\""));
                return true;
            }
            if (!File.Exists(path)) throw new UserException("That file is no longer there.");
            string ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext != ".pdf" && ext != ".docx" && ext != ".md" && ext != ".txt" && ext != ".log" && ext != ".json")
                throw new UserException("JobMech only opens documents it created.");
            ProcessStartInfo psi = new ProcessStartInfo(path);
            psi.UseShellExecute = true;
            Process.Start(psi);
            return true;
        }

        public void OpenExternal(string url)
        {
            try
            {
                Uri u;
                if (!Uri.TryCreate(url, UriKind.Absolute, out u)) return;
                if (u.Scheme != "https" && u.Scheme != "http" && u.Scheme != "mailto") return;
                ProcessStartInfo psi = new ProcessStartInfo(u.AbsoluteUri);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch (Exception ex) { Log.Write("ERROR", "Open external failed: " + ex.Message); }
        }

        // ------------------------------------------------------------ HTTP (AI providers, local models)

        private void HttpAbort(string reqId)
        {
            HttpWebRequest r = null;
            lock (httpGate) { activeHttp.TryGetValue(reqId, out r); }
            if (r != null) { try { r.Abort(); } catch { } }
        }

        /// <summary>
        /// Runs on a worker thread. The UI never sees API keys: it references a stored secret by
        /// name and the key is injected here, only for the host it was saved for.
        /// </summary>
        public object HttpRequest(Dictionary<string, object> p)
        {
            string url = S(p, "url");
            string method = S(p, "method", "GET").ToUpperInvariant();
            string reqId = S(p, "reqId");
            bool stream = B(p, "stream", false);
            int timeout = (int)D(p, "timeoutMs", 180000);
            string body = p.ContainsKey("body") && p["body"] != null ? Convert.ToString(p["body"]) : null;

            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || (uri.Scheme != "https" && uri.Scheme != "http"))
                throw new UserException("Invalid address: " + url);

            string secretValue = null;
            string secretName = S(p, "secret");
            if (!string.IsNullOrEmpty(secretName))
            {
                secretValue = secrets.GetForHost(secretName, uri.Host);
                if (secretValue == null) throw new UserException("No API key is saved for this provider yet. Add it in Settings.");
            }

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(uri);
            req.Method = method;
            req.Timeout = timeout;
            req.ReadWriteTimeout = timeout;
            req.UserAgent = "JobMech/" + Program.AppVersion;
            req.AllowAutoRedirect = true;
            if (uri.IsLoopback) req.Proxy = null;
            if (!stream) req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

            Dictionary<string, object> headers = p.ContainsKey("headers") ? p["headers"] as Dictionary<string, object> : null;
            if (headers != null)
            {
                foreach (KeyValuePair<string, object> kv in headers)
                {
                    string name = kv.Key;
                    string value = Convert.ToString(kv.Value ?? "");
                    if (secretValue != null) value = value.Replace("{{secret}}", secretValue);
                    string lower = name.ToLowerInvariant();
                    if (lower == "content-type") req.ContentType = value;
                    else if (lower == "accept") req.Accept = value;
                    else if (lower == "user-agent") req.UserAgent = value;
                    else if (lower == "referer") req.Referer = value;
                    else if (lower == "content-length" || lower == "host" || lower == "connection") { }
                    else req.Headers[name] = value;
                }
            }

            if (!string.IsNullOrEmpty(reqId)) lock (httpGate) { activeHttp[reqId] = req; }
            try
            {
                if (body != null && method != "GET" && method != "HEAD")
                {
                    byte[] bytes = Encoding.UTF8.GetBytes(body);
                    if (string.IsNullOrEmpty(req.ContentType)) req.ContentType = "application/json";
                    req.ContentLength = bytes.Length;
                    using (Stream rs = req.GetRequestStream()) rs.Write(bytes, 0, bytes.Length);
                }

                HttpWebResponse resp;
                try
                {
                    resp = (HttpWebResponse)req.GetResponse();
                }
                catch (WebException wex)
                {
                    if (wex.Status == WebExceptionStatus.RequestCanceled) return Obj("status", 0, "aborted", true, "body", "");
                    resp = wex.Response as HttpWebResponse;
                    if (resp == null) throw new UserException(DescribeNetworkError(wex, uri));
                }

                using (resp)
                {
                    int status = (int)resp.StatusCode;
                    Dictionary<string, object> h = new Dictionary<string, object>();
                    foreach (string key in resp.Headers.AllKeys) h[key.ToLowerInvariant()] = resp.Headers[key];

                    StringBuilder text = new StringBuilder();
                    using (Stream s = resp.GetResponseStream())
                    {
                        if (stream && status < 400)
                        {
                            Decoder dec = Encoding.UTF8.GetDecoder();
                            byte[] buf = new byte[16384];
                            char[] chars = new char[16384 + 8];
                            int n;
                            while ((n = s.Read(buf, 0, buf.Length)) > 0)
                            {
                                int c = dec.GetChars(buf, 0, n, chars, 0);
                                if (c > 0) form.Emit("http.chunk", Obj("reqId", reqId, "text", new string(chars, 0, c)));
                            }
                        }
                        else
                        {
                            using (StreamReader sr = new StreamReader(s, Encoding.UTF8)) text.Append(sr.ReadToEnd());
                        }
                    }
                    return Obj("status", status, "headers", h, "body", text.ToString(), "aborted", false);
                }
            }
            catch (WebException wex)
            {
                if (wex.Status == WebExceptionStatus.RequestCanceled) return Obj("status", 0, "aborted", true, "body", "");
                throw new UserException(DescribeNetworkError(wex, uri));
            }
            catch (IOException ioex)
            {
                bool cancelled;
                lock (httpGate) { cancelled = !activeHttp.ContainsKey(reqId ?? ""); }
                if (cancelled) return Obj("status", 0, "aborted", true, "body", "");
                throw new UserException("The connection to " + uri.Host + " was interrupted. " + ioex.Message);
            }
            finally
            {
                if (!string.IsNullOrEmpty(reqId)) lock (httpGate) { activeHttp.Remove(reqId); }
            }
        }

        private static string DescribeNetworkError(WebException wex, Uri uri)
        {
            switch (wex.Status)
            {
                case WebExceptionStatus.NameResolutionFailure:
                    return "Could not reach " + uri.Host + ". Check your internet connection.";
                case WebExceptionStatus.ConnectFailure:
                    return uri.IsLoopback
                        ? "Nothing is answering at " + uri.Host + ":" + uri.Port + ". Is the local AI app running?"
                        : "Could not connect to " + uri.Host + ". Check your internet connection or firewall.";
                case WebExceptionStatus.Timeout:
                    return "The AI took too long to answer (timeout). Try again, or pick a faster model.";
                case WebExceptionStatus.TrustFailure:
                case WebExceptionStatus.SecureChannelFailure:
                    return "A secure connection to " + uri.Host + " could not be established.";
                default:
                    return "Network error talking to " + uri.Host + ": " + wex.Message;
            }
        }

        // ------------------------------------------------------------ system information

        [StructLayout(LayoutKind.Sequential)]
        private struct MEMORYSTATUSEX
        {
            public uint dwLength, dwMemoryLoad;
            public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX buffer);

        private object Hardware()
        {
            double ramGb = 0;
            try
            {
                MEMORYSTATUSEX m = new MEMORYSTATUSEX();
                m.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
                if (GlobalMemoryStatusEx(ref m)) ramGb = Math.Round(m.ullTotalPhys / 1073741824.0, 1);
            }
            catch { }

            List<object> gpus = new List<object>();
            try
            {
                using (RegistryKey cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"))
                {
                    if (cls != null)
                    {
                        foreach (string sub in cls.GetSubKeyNames())
                        {
                            if (sub.Length != 4) continue;
                            try
                            {
                                using (RegistryKey k = cls.OpenSubKey(sub))
                                {
                                    if (k == null) continue;
                                    string name = Convert.ToString(k.GetValue("DriverDesc") ?? "");
                                    if (name.Length == 0) continue;
                                    double vram = 0;
                                    object q = k.GetValue("HardwareInformation.qwMemorySize");
                                    if (q != null) vram = Convert.ToDouble(Convert.ToInt64(q)) / 1073741824.0;
                                    else
                                    {
                                        object mraw = k.GetValue("HardwareInformation.MemorySize");
                                        if (mraw is byte[] && ((byte[])mraw).Length >= 4) vram = BitConverter.ToUInt32((byte[])mraw, 0) / 1073741824.0;
                                        else if (mraw != null) vram = Convert.ToDouble(Convert.ToUInt32(mraw)) / 1073741824.0;
                                    }
                                    gpus.Add(Obj("name", name, "vramGb", Math.Round(vram, 1)));
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch { }

            return Obj("ramGb", ramGb, "cores", Environment.ProcessorCount, "gpus", gpus);
        }

        private static string FindOllama()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates =
            {
                Path.Combine(local, @"Programs\Ollama\ollama app.exe"),
                Path.Combine(local, @"Programs\Ollama\ollama.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Ollama\ollama.exe")
            };
            foreach (string c in candidates) if (File.Exists(c)) return c;
            return null;
        }

        private object OllamaLaunch()
        {
            string exe = FindOllama();
            if (exe == null) return Obj("installed", false, "started", false);
            ProcessStartInfo psi = new ProcessStartInfo(exe);
            if (!exe.EndsWith("app.exe", StringComparison.OrdinalIgnoreCase))
            {
                psi.Arguments = "serve";
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
            }
            Process.Start(psi);
            return Obj("installed", true, "started", true);
        }

        private object OllamaInstall()
        {
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe",
                "/k title Installing Ollama for JobMech & winget install -e --id Ollama.Ollama & echo. & echo You can close this window and go back to JobMech.");
            psi.UseShellExecute = true;
            Process.Start(psi);
            return Obj("started", true);
        }
    }

    // ---------------------------------------------------------------- API keys, encrypted for this Windows user

    sealed class Secrets
    {
        private readonly string file;
        private readonly object gate = new object();
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("JobMech.Secrets.v1");

        public Secrets(string file) { this.file = file; }

        private Dictionary<string, object> Load()
        {
            try
            {
                if (!File.Exists(file)) return new Dictionary<string, object>();
                byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(file), Entropy, DataProtectionScope.CurrentUser);
                Dictionary<string, object> d = Services.Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(plain));
                return d ?? new Dictionary<string, object>();
            }
            catch (Exception ex)
            {
                // Typically: the data folder was copied from another PC or Windows account.
                Log.Write("WARN", "Saved API keys could not be decrypted: " + ex.Message);
                return new Dictionary<string, object>();
            }
        }

        private void Save(Dictionary<string, object> d)
        {
            byte[] plain = Encoding.UTF8.GetBytes(Services.Json.Serialize(d));
            byte[] cipher = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllBytes(file, cipher);
        }

        public void Set(string name, string value, string host)
        {
            if (string.IsNullOrWhiteSpace(name)) throw new UserException("Missing key name.");
            lock (gate)
            {
                Dictionary<string, object> d = Load();
                Dictionary<string, object> entry = new Dictionary<string, object>();
                entry["value"] = (value ?? "").Trim();
                entry["host"] = (host ?? "").Trim().ToLowerInvariant();
                d[name] = entry;
                Save(d);
            }
        }

        public void Delete(string name)
        {
            lock (gate)
            {
                Dictionary<string, object> d = Load();
                if (d.Remove(name)) Save(d);
            }
        }

        /// <summary>
        /// Takes over the keys of another JobMech key file, without replacing any that is saved here
        /// already. Only works for a file encrypted for this Windows account; otherwise nothing happens.
        /// </summary>
        public int AdoptFrom(string otherFile)
        {
            lock (gate)
            {
                Dictionary<string, object> other;
                try
                {
                    byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(otherFile), Entropy, DataProtectionScope.CurrentUser);
                    other = Services.Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(plain));
                }
                catch { return 0; }
                if (other == null) return 0;
                Dictionary<string, object> d = Load();
                int n = 0;
                foreach (KeyValuePair<string, object> kv in other)
                {
                    if (d.ContainsKey(kv.Key) || !(kv.Value is Dictionary<string, object>)) continue;
                    d[kv.Key] = kv.Value;
                    n++;
                }
                if (n > 0) Save(d);
                return n;
            }
        }

        public object Info(string name)
        {
            lock (gate)
            {
                Dictionary<string, object> d = Load();
                Dictionary<string, object> r = new Dictionary<string, object>();
                Dictionary<string, object> entry = d.ContainsKey(name) ? d[name] as Dictionary<string, object> : null;
                string value = entry != null ? Convert.ToString(entry["value"]) : "";
                r["exists"] = value.Length > 0;
                r["hint"] = value.Length > 8 ? value.Substring(0, 3) + "..." + value.Substring(value.Length - 4) : (value.Length > 0 ? "saved" : "");
                r["host"] = entry != null && entry.ContainsKey("host") ? Convert.ToString(entry["host"]) : "";
                return r;
            }
        }

        public string GetForHost(string name, string requestHost)
        {
            lock (gate)
            {
                Dictionary<string, object> d = Load();
                Dictionary<string, object> entry = d.ContainsKey(name) ? d[name] as Dictionary<string, object> : null;
                if (entry == null) return null;
                string value = Convert.ToString(entry["value"]);
                if (value.Length == 0) return null;
                string host = entry.ContainsKey("host") ? Convert.ToString(entry["host"]) : "";
                string rh = (requestHost ?? "").ToLowerInvariant();
                if (host.Length > 0 && rh != host && !rh.EndsWith("." + host))
                    throw new UserException("This API key was saved for " + host + " and will not be sent to " + requestHost + ".");
                return value;
            }
        }
    }

    // ---------------------------------------------------------------- Windows shell helpers

    static class KnownFolders
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid rfid, uint flags, IntPtr token, out IntPtr path);

        public static string Downloads()
        {
            IntPtr p = IntPtr.Zero;
            try
            {
                if (SHGetKnownFolderPath(new Guid("374DE290-123F-4565-9164-39C4925E467B"), 0, IntPtr.Zero, out p) == 0)
                {
                    string s = Marshal.PtrToStringUni(p);
                    if (!string.IsNullOrEmpty(s) && Directory.Exists(s)) return s;
                }
            }
            catch { }
            finally { if (p != IntPtr.Zero) Marshal.FreeCoTaskMem(p); }
            string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            return Directory.Exists(fallback) ? fallback : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        }
    }

    /// <summary>The modern Windows "Select folder" dialog (WinForms only ships the old tree view).</summary>
    static class FolderPicker
    {
        [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
        private class FileOpenDialogRCW { }

        [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileOpenDialog
        {
            [PreserveSig] int Show(IntPtr parent);
            void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
            void SetFileTypeIndex(uint iFileType);
            void GetFileTypeIndex(out uint piFileType);
            void Advise(IntPtr pfde, out uint pdwCookie);
            void Unadvise(uint dwCookie);
            void SetOptions(uint fos);
            void GetOptions(out uint pfos);
            void SetDefaultFolder(IShellItem psi);
            void SetFolder(IShellItem psi);
            void GetFolder(out IShellItem ppsi);
            void GetCurrentSelection(out IShellItem ppsi);
            void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
            void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
            void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
            void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
            void GetResult(out IShellItem ppsi);
            void AddPlace(IShellItem psi, int fdap);
            void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
            void Close(int hr);
            void SetClientGuid(ref Guid guid);
            void ClearClientData();
            void SetFilter(IntPtr pFilter);
            void GetResults(out IntPtr ppenum);
            void GetSelectedItems(out IntPtr ppsai);
        }

        [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellItem
        {
            void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
            void GetParent(out IShellItem ppsi);
            void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
            void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
            void Compare(IShellItem psi, uint hint, out int piOrder);
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItem item);

        public static string Show(IntPtr owner, string title, string initialDir)
        {
            IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
            try
            {
                uint opts;
                dlg.GetOptions(out opts);
                dlg.SetOptions(opts | 0x20 | 0x40 | 0x800);   // pick folders, file system only, path must exist
                if (!string.IsNullOrEmpty(title)) dlg.SetTitle(title);
                if (!string.IsNullOrEmpty(initialDir) && Directory.Exists(initialDir))
                {
                    IShellItem start;
                    Guid iid = typeof(IShellItem).GUID;
                    if (SHCreateItemFromParsingName(initialDir, IntPtr.Zero, ref iid, out start) == 0 && start != null)
                        dlg.SetFolder(start);
                }
                if (dlg.Show(owner) != 0) return null;
                IShellItem result;
                dlg.GetResult(out result);
                string path;
                result.GetDisplayName(0x80058000, out path);
                return path;
            }
            finally
            {
                Marshal.ReleaseComObject(dlg);
            }
        }
    }
}
