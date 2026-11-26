using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SmartPdfUninstall
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            DialogResult result = MessageBox.Show(
                "क्या आप सचमुच Smart PDF Reader Pro को अपने कंप्यूटर से अन-इन्स्टॉल (Uninstall) करना चाहते हैं?",
                "Smart PDF Reader Uninstaller",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (result != DialogResult.Yes)
            {
                return;
            }

            try
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

                // 1. Remove Desktop Shortcut
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string deskShortcut1 = Path.Combine(desktop, "Smart PDF Pro.lnk");
                string deskShortcut2 = Path.Combine(desktop, "Smart PDF Reader.lnk");
                if (File.Exists(deskShortcut1)) File.Delete(deskShortcut1);
                if (File.Exists(deskShortcut2)) File.Delete(deskShortcut2);

                // 2. Remove Start Menu Shortcut
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                string startShortcut1 = Path.Combine(startMenu, "Smart PDF Pro.lnk");
                string startShortcut2 = Path.Combine(startMenu, "Smart PDF Reader.lnk");
                if (File.Exists(startShortcut1)) File.Delete(startShortcut1);
                if (File.Exists(startShortcut2)) File.Delete(startShortcut2);

                // 3. Remove Registry Entries
                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\SmartPdfReader", false);
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\SmartPdfReader.pdf", false);
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\Applications\SmartPdf-Pro.exe", false);
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\Applications\SmartPdfReader.exe", false);
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\SmartPdfReader", false);

                    using (RegistryKey openWith = Registry.CurrentUser.OpenSubKey(@"Software\Classes\.pdf\OpenWithProgids", true))
                    {
                        if (openWith != null) openWith.DeleteValue("SmartPdfReader.pdf", false);
                    }
                }
                catch { }

                // 4. Schedule self-deletion of files in background
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = string.Format("/c ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"{0}\"", appDir);
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                Process.Start(psi);

                MessageBox.Show(
                    "Smart PDF Reader Pro आपके कंप्यूटर से सफलतापूर्वक अन-इन्स्टॉल हो गया है!",
                    "Uninstalled",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show("त्रुटि: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
