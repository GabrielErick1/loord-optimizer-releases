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
        private const int VK_LBUTTON = 0x01; // Botao Esquerdo do Mouse

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

            // Padrao solicitado: Iniciar sempre com 0.1 (Ultra lenta, quase parando)
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
            Stopwatch sw = Stopwatch.StartNew();
            long lastMoveTime = 0;
            int loopCounter = 0;

            while (true)
            {
                loopCounter++;

                // Sincroniza estado e velocidade com o painel a cada ~25ms
                if (loopCounter % 5 == 0)
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
                        // Calculo dinamico de intervalo e forca calibrado por milissegundos:
                        // 0.1: 400ms por 1 pixel (~2.5 px/s -> Bem devagar, descida quase parando!)
                        // 0.2: 250ms por 1 pixel (~4.0 px/s)
                        // 0.5: 140ms por 1 pixel (~7.1 px/s -> Suave)
                        // 1.0: 65ms por 1 pixel (~15.4 px/s -> Recomendado/Equilibrado)
                        // 2.5: 40ms por 2 pixels (~50.0 px/s -> Media)
                        // 5.0: 30ms por 3 pixels (~100.0 px/s -> Forte)
                        // 10.0: 20ms por 5 pixels (~250.0 px/s -> Maxima)
                        int intervalMs;
                        int stepPixels;

                        if (speed <= 0.15)
                        {
                            intervalMs = 400; // Ultra lenta, quase parando
                            stepPixels = 1;
                        }
                        else if (speed <= 0.3)
                        {
                            intervalMs = 250;
                            stepPixels = 1;
                        }
                        else if (speed <= 0.7)
                        {
                            intervalMs = (int)(250.0 - ((speed - 0.3) / 0.4) * 110.0);
                            if (intervalMs < 130) intervalMs = 130;
                            stepPixels = 1;
                        }
                        else if (speed <= 1.5)
                        {
                            intervalMs = (int)(130.0 - ((speed - 0.7) / 0.8) * 65.0);
                            if (intervalMs < 55) intervalMs = 55;
                            stepPixels = 1;
                        }
                        else if (speed <= 3.5)
                        {
                            intervalMs = 40;
                            stepPixels = 2;
                        }
                        else if (speed <= 7.0)
                        {
                            intervalMs = 30;
                            stepPixels = 3;
                        }
                        else
                        {
                            intervalMs = 20;
                            stepPixels = (int)Math.Max(4, Math.Round(speed * 0.5));
                        }

                        long now = sw.ElapsedMilliseconds;
                        if (lastMoveTime == 0)
                        {
                            lastMoveTime = now;
                        }
                        else if (now - lastMoveTime >= intervalMs)
                        {
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepPixels, 0, 0);
                            lastMoveTime = now;
                        }

                        Thread.Sleep(5);
                    }
                    else
                    {
                        lastMoveTime = 0;
                        Thread.Sleep(10);
                    }
                }
                else
                {
                    lastMoveTime = 0;
                    Thread.Sleep(20);
                }
            }
        }

        private static string SafeReadAllText(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
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
