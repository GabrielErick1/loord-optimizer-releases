using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace LoordOptimizer
{
    public static class Program
    {
        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        [DllImport("winmm.dll")]
        public static extern uint timeBeginPeriod(uint uMilliseconds);

        private const int MOUSEEVENTF_MOVE = 0x0001;
        private const int VK_LBUTTON = 0x01; // Botao Esquerdo do Mouse (Disparar)
        private const int VK_F7      = 0x76; // Atalho F7
        private const int VK_F8      = 0x77; // Atalho F8

        private static readonly string[] SpeedPaths = new string[]
        {
            @"C:\ProgramData\LoordOptimizer\loord_macro_speed.txt",
            Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt"),
            @"C:\Windows\Temp\loord_macro_speed.txt"
        };

        private static readonly string[] ActivePaths = new string[]
        {
            @"C:\ProgramData\LoordOptimizer\loord_macro_active.txt",
            Path.Combine(Path.GetTempPath(), "loord_macro_active.txt"),
            @"C:\Windows\Temp\loord_macro_active.txt"
        };

        [STAThread]
        public static void Main(string[] args)
        {
            try { timeBeginPeriod(1); } catch { }

            double speed = 0.1;
            if (args != null && args.Length > 0)
            {
                double parsed;
                if (double.TryParse(args[0].Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed))
                {
                    if (parsed >= 0.05 && parsed <= 50.0) speed = parsed;
                }
            }

            bool macroAtiva = false;
            double accumY = 0.0;
            int loopCounter = 0;

            while (true)
            {
                loopCounter++;

                // Atalhos oficiais exclusivos no jogo: F7 ou F8 (Liga / Desliga com bip)
                bool f7 = (GetAsyncKeyState(VK_F7) & 0x8000) != 0;
                bool f8 = (GetAsyncKeyState(VK_F8) & 0x8000) != 0;

                if (f7 || f8)
                {
                    macroAtiva = !macroAtiva;
                    try { Console.Beep(macroAtiva ? 1200 : 500, 100); } catch { }
                    foreach (string ap in ActivePaths)
                    {
                        try { File.WriteAllText(ap, macroAtiva ? "true" : "false"); } catch { }
                    }
                    Thread.Sleep(300);
                }

                // Sincroniza estado e velocidade com o painel a cada ~20ms
                if (loopCounter % 3 == 0)
                {
                    foreach (string ap in ActivePaths)
                    {
                        string actText = SafeReadAllText(ap);
                        if (!string.IsNullOrEmpty(actText))
                        {
                            string act = actText.Trim().ToLower();
                            if (act == "true" || act == "1") macroAtiva = true;
                            else if (act == "false" || act == "0") macroAtiva = false;
                            break;
                        }
                    }

                    foreach (string sp in SpeedPaths)
                    {
                        string spdText = SafeReadAllText(sp);
                        if (!string.IsNullOrEmpty(spdText))
                        {
                            string cfg = spdText.Trim().Replace(',', '.');
                            double newSpd;
                            if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd))
                            {
                                if (newSpd >= 0.05 && newSpd <= 50.0)
                                {
                                    speed = newSpd;
                                }
                            }
                            break;
                        }
                    }
                }

                if (macroAtiva)
                {
                    bool isShooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                    if (isShooting)
                    {
                        // Acumulador fracionado dinâmico de alta precisão:
                        // Cada aumento de velocidade (0.1 -> 0.5 -> 1.0 -> 2.5 -> 5.0 -> 10.0)
                        // resulta em uma descida proporcionalmente MUITO mais rápida!
                        accumY += speed;
                        if (accumY >= 1.0)
                        {
                            int stepY = (int)Math.Floor(accumY);
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                            accumY -= stepY;
                        }

                        Thread.Sleep(7);
                    }
                    else
                    {
                        accumY = 0.0;
                        Thread.Sleep(8);
                    }
                }
                else
                {
                    accumY = 0.0;
                    Thread.Sleep(20);
                }
            }
        }

        private static string SafeReadAllText(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var reader = new StreamReader(fs))
                {
                    return reader.ReadToEnd();
                }
            }
            catch
            {
                return null;
            }
        }
    }
}
