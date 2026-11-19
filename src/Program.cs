// JobMech 2 - native host entry point.
// Compiled with the C# 5 compiler that ships with .NET Framework 4.x (see build.bat),
// so this file intentionally avoids newer language features.
using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("JobMech")]
[assembly: AssemblyDescription("Tailored CVs and cover letters, formatted for the country you are applying to.")]
[assembly: AssemblyProduct("JobMech")]
[assembly: AssemblyCompany("JobMech")]
[assembly: AssemblyCopyright("JobMech")]
[assembly: AssemblyVersion("2.1.1.0")]
[assembly: AssemblyFileVersion("2.1.1.0")]

namespace JobMech
{
    static class Program
    {
        public const string AppVersion = "2.1.1";
        public const string AppHost = "app.jobmech.example";
        public const string AppOrigin = "https://app.jobmech.example";

        public static string BaseDir;
        public static string AppDir;
        public static string DataDir;
        public static string UserDataDir;      // the default place: %APPDATA%\JobMech\data
        public static string DataMode;         // "user", "portable" or "custom"
        public static string WebViewDir;
        public static bool DevMode;
        public static bool CustomDataDir;
        public static int DebugPort;

        [DllImport("shell32.dll")]
        private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);

        [STAThread]
        static int Main(string[] args)
        {
            BaseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            AppDir = Path.Combine(BaseDir, "app");

            string dataArg = null;
            string printTo = null;
            foreach (string a in args)
            {
                if (a == "--dev") DevMode = true;
                else if (a.StartsWith("--data-dir=")) dataArg = a.Substring(11).Trim('"');
                else if (a.StartsWith("--debug-port=")) { int.TryParse(a.Substring(13), out DebugPort); DevMode = true; }
                else if (a.StartsWith("--print-data-dir=")) printTo = a.Substring(17).Trim('"');
            }

            ResolveDataDir(dataArg);
            if (printTo != null)
            {
                // Used by the tests: report where the data would live, touch nothing, and leave.
                try { File.WriteAllText(printTo, DataMode + "|" + DataDir); return 0; }
                catch { return 1; }
            }
            Directory.CreateDirectory(DataDir);

            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                Log.Write("FATAL", Convert.ToString(e.ExceptionObject));
            };
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e)
            {
                Log.Write("ERROR", Convert.ToString(e.Exception));
            };

            // One window per data folder: a second launch just brings the first one forward.
            string instanceKey = "JobMech.Studio." + StableHash(DataDir);
            bool isFirst;
            Mutex mutex = new Mutex(true, instanceKey + ".Mutex", out isFirst);
            EventWaitHandle activate = new EventWaitHandle(false, EventResetMode.AutoReset, instanceKey + ".Activate");
            if (!isFirst)
            {
                try { activate.Set(); } catch { }
                return 0;
            }

            try { SetCurrentProcessExplicitAppUserModelID("JobMech.Studio"); } catch { }
            System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)(3072 | 12288);
            System.Net.ServicePointManager.Expect100Continue = false;
            System.Net.ServicePointManager.DefaultConnectionLimit = 12;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (!Directory.Exists(AppDir) || !File.Exists(Path.Combine(AppDir, "index.html")))
            {
                MessageBox.Show("JobMech could not find its \"app\" folder next to JobMech.exe.\n\nKeep JobMech.exe, the app folder and the three DLL files together.",
                    "JobMech", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 2;
            }

            MainForm form = new MainForm();

            Thread listener = new Thread(delegate()
            {
                while (true)
                {
                    try { activate.WaitOne(); } catch { return; }
                    try { form.BeginInvoke((MethodInvoker)delegate { form.BringToFront2(); }); } catch { }
                }
            });
            listener.IsBackground = true;
            listener.Start();

            Application.Run(form);
            GC.KeepAlive(mutex);
            return 0;
        }

        /// <summary>
        /// Decides where the data lives. Nothing is created here (Main does that), so the
        /// decision can be reported without side effects.
        ///   --data-dir=X             that folder
        ///   a "data" folder next     that folder (portable use: a USB stick, or a copy that
        ///   to JobMech.exe           already keeps its data there)
        ///   otherwise                %APPDATA%\JobMech\data, where every later version of the
        ///                            program finds it again, wherever it was unzipped
        /// </summary>
        private static void ResolveDataDir(string dataArg)
        {
            UserDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JobMech", "data");
            if (!string.IsNullOrEmpty(dataArg))
            {
                DataDir = Path.GetFullPath(dataArg).TrimEnd('\\');
                DataMode = "custom";
                CustomDataDir = true;
                WebViewDir = Path.Combine(DataDir, ".webview");
                return;
            }

            string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JobMech");
            WebViewDir = Path.Combine(local, "WebView2");

            string portable = Path.Combine(BaseDir, "data");
            if (Directory.Exists(portable) && IsWritable(portable))
            {
                DataDir = portable;
                DataMode = "portable";
                return;
            }
            DataDir = UserDataDir;
            DataMode = "user";
        }

        private static bool IsWritable(string dir)
        {
            try
            {
                Directory.CreateDirectory(dir);
                string probe = Path.Combine(dir, ".write-test-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return true;
            }
            catch { return false; }
        }

        private static string StableHash(string text)
        {
            unchecked
            {
                uint h = 2166136261;
                foreach (char c in text.ToLowerInvariant()) { h ^= c; h *= 16777619; }
                return h.ToString("x8");
            }
        }
    }

    static class Log
    {
        private static readonly object Gate = new object();

        public static void Write(string level, string message)
        {
            try
            {
                lock (Gate)
                {
                    string dir = Path.Combine(Program.DataDir ?? Path.GetTempPath(), "logs");
                    Directory.CreateDirectory(dir);
                    string file = Path.Combine(dir, "jobmech.log");
                    FileInfo fi = new FileInfo(file);
                    if (fi.Exists && fi.Length > 1024 * 1024)
                    {
                        string old = Path.Combine(dir, "jobmech.old.log");
                        if (File.Exists(old)) File.Delete(old);
                        File.Move(file, old);
                    }
                    File.AppendAllText(file,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + level + "] " + message + Environment.NewLine,
                        new UTF8Encoding(false));
                }
            }
            catch { }
        }
    }
}
