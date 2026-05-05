using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class Program
{
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string index = Path.Combine(dir, "index.js");

        if (!File.Exists(index))
        {
            System.Windows.Forms.MessageBox.Show("index.js wurde nicht gefunden.");
            return;
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = "node";
        psi.Arguments = "index.js";
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;

        Process.Start(psi);

        Thread.Sleep(2000);

        Process.Start(new ProcessStartInfo
        {
            FileName = "http://localhost:3000",
            UseShellExecute = true
        });
    }
}
