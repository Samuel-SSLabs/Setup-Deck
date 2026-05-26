package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/serial"
	"go.bug.st/serial/enumerator"
	"golang.org/x/sys/windows/registry"
)

type Stats struct {
	Total    int    `json:"total"`
	Btn0     int    `json:"btn0"`
	Btn1     int    `json:"btn1"`
	Btn2     int    `json:"btn2"`
	Btn3     int    `json:"btn3"`
	Btn4     int    `json:"btn4"`
	Btn5     int    `json:"btn5"`
	FirstUse string `json:"firstUse"`
}

type GitHubRelease struct {
	TagName string `json:"tag_name"`
	HtmlUrl string `json:"html_url"`
}

const VERSAO_APP_ATUAL = "v1.8"

type App struct {
	ctx          context.Context
	mu           sync.Mutex
	portaSerial  serial.Port
	jsonRecebido string
	msgSistema   string
	nomeDeck     string
	versaoDeck   string
}

func NewApp() *App { return &App{} }

func parseVersao(v string) float64 {
	v = strings.TrimPrefix(v, "v")
	partes := strings.Split(v, ".")
	if len(partes) >= 2 {
		val, _ := strconv.ParseFloat(partes[0]+"."+partes[1], 64)
		return val
	}
	val, _ := strconv.ParseFloat(v, 64)
	return val
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.ManterConexaoPersistente()
}

func (a *App) getStatsFilePath() string {
	configDir, _ := os.UserConfigDir()
	appDir := filepath.Join(configDir, "SetupDeck")
	os.MkdirAll(appDir, os.ModePerm)
	return filepath.Join(appDir, "stats.json")
}

func (a *App) LerEstatisticas() Stats {
	var s Stats
	path := a.getStatsFilePath()
	data, err := os.ReadFile(path)
	if err == nil {
		json.Unmarshal(data, &s)
	}

	if s.FirstUse == "" {
		s.FirstUse = time.Now().Format("02/01/2006")
		dataStr, _ := json.Marshal(s)
		os.WriteFile(path, dataStr, 0644)
	}
	return s
}

func (a *App) registrarClique(btnIndex int) {
	s := a.LerEstatisticas()
	s.Total++
	switch btnIndex {
	case 0: s.Btn0++
	case 1: s.Btn1++
	case 2: s.Btn2++
	case 3: s.Btn3++
	case 4: s.Btn4++
	case 5: s.Btn5++
	}
	data, _ := json.Marshal(s)
	os.WriteFile(a.getStatsFilePath(), data, 0644)
}

func (a *App) ReiniciarConexao() {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "deckStatus", false, "")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.portaSerial != nil {
		a.portaSerial.Close()
	}
}

func (a *App) ManterConexaoPersistente() {
	conectadoAntes := false
	for {
		if a.ctx == nil {
			time.Sleep(1 * time.Second)
			continue
		}
		portaName, err := a.encontrarPortaDeDados()

		if err == nil && portaName != "" {
			if !conectadoAntes {
				mode := &serial.Mode{BaudRate: 115200}
				porta, errOpen := serial.Open(portaName, mode)
				if errOpen == nil {
					a.mu.Lock()
					a.portaSerial = porta
					a.mu.Unlock()

					porta.SetDTR(true)
					porta.SetRTS(true)
					time.Sleep(1500 * time.Millisecond)

					porta.Write([]byte("PING\r\n"))
					conectadoAntes = true

					// Heartbeat para manter a porta responsiva
					go func() {
						for {
							a.mu.Lock()
							p := a.portaSerial
							a.mu.Unlock()
							if p == nil { return }
							_, err := p.Write([]byte("PING\r\n"))
							if err != nil { return }
							time.Sleep(3 * time.Second)
						}
					}()

					a.escutarPorta(porta)

					conectadoAntes = false
					a.mu.Lock()
					a.portaSerial = nil
					a.nomeDeck = ""
					a.versaoDeck = ""
					a.mu.Unlock()
					runtime.EventsEmit(a.ctx, "deckStatus", false, "")
				}
			}
		} else {
			if conectadoAntes {
				conectadoAntes = false
				runtime.EventsEmit(a.ctx, "deckStatus", false, "")
			}
		}
		time.Sleep(2 * time.Second)
	}
}

func (a *App) escutarPorta(porta serial.Port) {
	buf := make([]byte, 2048)
	var msgBuffer string

	for {
		porta.SetReadTimeout(200 * time.Millisecond)
		n, err := porta.Read(buf)
		if err != nil {
			return
		}

		if n > 0 {
			msgBuffer += string(buf[:n])
			linhas := strings.Split(msgBuffer, "\n")
			msgBuffer = linhas[len(linhas)-1]

			for i := 0; i < len(linhas)-1; i++ {
				linha := strings.TrimSpace(linhas[i])
				if linha == "" {
					continue
				}

				a.mu.Lock()
				if strings.HasPrefix(linha, "PONG:") {
					partes := strings.Split(linha, ":")
					nome := "Desconhecida"
					versao := "0.0.0"

					if len(partes) >= 2 { nome = partes[1] }
					if len(partes) >= 3 { versao = partes[2] }

					a.nomeDeck = strings.TrimSpace(nome)
					a.versaoDeck = strings.TrimSpace(versao)
					runtime.EventsEmit(a.ctx, "deckStatus", true, a.nomeDeck)

				} else if strings.HasPrefix(linha, "CLICK:") {
					partes := strings.Split(linha, ":")
					if len(partes) == 2 {
						idx, _ := strconv.Atoi(partes[1])
						a.registrarClique(idx)
						runtime.EventsEmit(a.ctx, "statsUpdated") 
					}

				} else if strings.HasPrefix(linha, "CMD:APP_TOGGLE") {
					if a.ctx != nil {
						runtime.WindowShow(a.ctx)
						runtime.WindowUnminimise(a.ctx)
					}

				} else if strings.HasPrefix(linha, "{") {
					a.jsonRecebido = linha
				} else if linha == "READY" || linha == "SAVED" || linha == "ERROR" {
					a.msgSistema = linha
				}
				a.mu.Unlock()
			}
		}
	}
}

func (a *App) encontrarPortaDeDados() (string, error) {
	portas, err := enumerator.GetDetailedPortsList()
	if err != nil {
		return "", err
	}
	for _, p := range portas {
		if p.IsUSB && strings.ToUpper(p.VID) == "2E8A" {
			return p.Name, nil
		}
	}
	return "", fmt.Errorf("nenhuma deck")
}

func (a *App) LerConfigDaDeck() string {
	a.mu.Lock()
	if a.portaSerial == nil {
		a.mu.Unlock()
		return ""
	}
	porta := a.portaSerial
	a.jsonRecebido = ""
	a.mu.Unlock()

	porta.Write([]byte("SYNC_READ\r\n"))
	for i := 0; i < 20; i++ {
		time.Sleep(100 * time.Millisecond)
		a.mu.Lock()
		if a.jsonRecebido != "" {
			res := a.jsonRecebido
			a.mu.Unlock()
			return res
		}
		a.mu.Unlock()
	}
	return ""
}

func (a *App) SincronizarDeck(jsonConfig string) bool {
	a.mu.Lock()
	if a.portaSerial == nil {
		a.mu.Unlock()
		return false
	}
	porta := a.portaSerial
	a.msgSistema = ""
	a.mu.Unlock()

	porta.Write([]byte("SYNC_START\r\n"))
	sucesso := false
	for i := 0; i < 15; i++ {
		time.Sleep(100 * time.Millisecond)
		a.mu.Lock()
		if a.msgSistema == "READY" {
			a.msgSistema = ""
			jsonLimpo := strings.ReplaceAll(jsonConfig, "\n", "")
			jsonLimpo = strings.ReplaceAll(jsonLimpo, "\r", "")
			porta.Write([]byte(jsonLimpo + "\r\n"))
			sucesso = true
			a.mu.Unlock()
			break
		}
		a.mu.Unlock()
	}

	if !sucesso {
		return false
	}

	for i := 0; i < 20; i++ {
		time.Sleep(100 * time.Millisecond)
		a.mu.Lock()
		if a.msgSistema == "SAVED" {
			a.mu.Unlock()
			return true
		} else if a.msgSistema == "ERROR" {
			a.mu.Unlock()
			return false
		}
		a.mu.Unlock()
	}
	return false
}

// ==========================================================
// REGEDIT E BANDEJA
// ==========================================================
func (a *App) MudarTema(tema string) {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\SetupDeck`, registry.ALL_ACCESS)
	if err != nil {
		k, _, _ = registry.CreateKey(registry.CURRENT_USER, `Software\SetupDeck`, registry.ALL_ACCESS)
	}
	if k != 0 {
		k.SetStringValue("Tema", tema)
		k.Close()
	}
	iconName := "frontend/dist/assets/icon-" + tema + ".ico"
	iconData, err := os.ReadFile(iconName)
	if err != nil {
		iconData, _ = os.ReadFile("frontend/dist/assets/icon.ico")
	}
	systray.SetIcon(iconData)
}

func (a *App) LerTema() string {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\SetupDeck`, registry.READ)
	if err != nil {
		return "volt"
	}
	defer k.Close()
	val, _, err := k.GetStringValue("Tema")
	if err != nil || val == "" {
		return "volt"
	}
	return val
}

func (a *App) AtivarIniciacaoAutomatica() bool {
	exePath, err := os.Executable()
	if err != nil { return false }
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.ALL_ACCESS)
	if err != nil { return false }
	defer k.Close()
	err = k.SetStringValue("SetupDeck", `"`+exePath+`" -hidden`)
	return err == nil
}

func (a *App) DesativarIniciacaoAutomatica() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.ALL_ACCESS)
	if err != nil { return false }
	defer k.Close()
	err = k.DeleteValue("SetupDeck")
	return err == nil
}

func (a *App) VerificarAutoStart() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.READ)
	if err != nil { return false }
	defer k.Close()
	_, _, err = k.GetStringValue("SetupDeck")
	return err == nil
}

// ==========================================================
// MÓDULOS DE ATUALIZAÇÃO E INFOS DE SISTEMA
// ==========================================================
func (a *App) ObterInfoSistema() map[string]string {
	a.mu.Lock()
	defer a.mu.Unlock()

	nome := a.nomeDeck
	if nome == "" || nome == "Desconhecida" {
		nome = "Nenhuma Deck Conectada"
	}

	versaoD := a.versaoDeck
	if versaoD == "" {
		versaoD = "-"
	}

	return map[string]string{
		"appVersion":  VERSAO_APP_ATUAL,
		"deckName":    nome,
		"deckVersion": versaoD,
	}
}

func (a *App) AtualizarFirmwareDaNuvem() string {
	a.mu.Lock()
	modeloAtual := a.nomeDeck
	versaoAtual := a.versaoDeck
	portaAtiva := a.portaSerial != nil
	a.mu.Unlock()

	if !portaAtiva || modeloAtual == "Desconhecida" || modeloAtual == "" {
		return "ERRO: Nenhuma Deck válida conectada."
	}

	urlBase := fmt.Sprintf("https://raw.githubusercontent.com/SeuUsuario/Decks-Firmware/main/firmwares/%s", modeloAtual)

	respVer, err := http.Get(urlBase + "/version.txt")
	if err != nil || respVer.StatusCode != 200 {
		return "ERRO: Não foi possível verificar atualizações para a " + modeloAtual + " Deck."
	}
	defer respVer.Body.Close()

	corpoVer, _ := io.ReadAll(respVer.Body)
	versaoNuvem := strings.TrimSpace(string(corpoVer))

	if versaoAtual == versaoNuvem {
		return "INFO: A " + modeloAtual + " Deck já está na versão mais recente (" + versaoAtual + ")!"
	}

	respCode, err := http.Get(urlBase + "/code.py")
	if err != nil || respCode.StatusCode != 200 {
		return "ERRO: Falha ao baixar o novo firmware."
	}
	defer respCode.Body.Close()

	a.mu.Lock()
	porta := a.portaSerial
	a.mu.Unlock()

	porta.Write([]byte("CMD:UPDATE_FIRMWARE\r\n"))
	time.Sleep(1 * time.Second)

	scanner := bufio.NewScanner(respCode.Body)
	for scanner.Scan() {
		porta.Write([]byte(scanner.Text() + "\n"))
		time.Sleep(10 * time.Millisecond)
	}

	porta.Write([]byte("CMD:UPDATE_DONE\r\n"))
	return "SUCESSO: Deck atualizada para a versão " + versaoNuvem + "!"
}

func (a *App) VerificarModoPortatil() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	appData, err := os.UserConfigDir()
	if err != nil {
		return false
	}
	return !strings.HasPrefix(exePath, appData)
}


func (a *App) ObterCaminhoPadraoInstalacao() string {
	appData, err := os.UserConfigDir()
	if err != nil {
		return `C:\SetupDeck`
	}
	return filepath.Join(appData, "SetupDeck")
}

func (a *App) InstalarCompleto(pastaDestino string, criarDesktop bool, autoStart bool) string {
	exeAtual, _ := os.Executable()
	exeDestino := filepath.Join(pastaDestino, "Setup Deck.exe")

	err := os.MkdirAll(pastaDestino, 0755)
	if err != nil { return "ERRO: Não foi possível criar a pasta de destino. Tente executar como Administrador." }

	fonte, err := os.Open(exeAtual)
	if err != nil { return "ERRO: Falha ao ler o aplicativo portátil." }

	destino, err := os.Create(exeDestino)
	if err != nil {
		fonte.Close()
		return "ERRO: Caminho de destino bloqueado."
	}

	_, err = io.Copy(destino, fonte)
	fonte.Close()
	destino.Close() // Fecha explicitamente antes do os.Exit (defer não roda com os.Exit)
	if err != nil { return "ERRO: Falha na cópia dos arquivos." }

	a.criarAtalhoMenuIniciar(exeDestino) // Cria atalho no Menu Iniciar

	if criarDesktop {
		scriptPS := fmt.Sprintf(`$d=[Environment]::GetFolderPath('Desktop');$s=(New-Object -COM WScript.Shell).CreateShortcut("$d\Setup Deck.lnk");$s.TargetPath='%s';$s.WindowStyle=1;$s.Save()`, exeDestino)
		exec.Command("powershell", "-Command", scriptPS).Run()
	}

	if autoStart {
		appData, _ := os.UserConfigDir()
		pastaStartup := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
		atalhoStartup := filepath.Join(pastaStartup, "SetupDeck.lnk")
		scriptPS := fmt.Sprintf(`$s=(New-Object -COM WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.Arguments='-hidden';$s.WindowStyle=7;$s.Save()`, atalhoStartup, exeDestino)
		exec.Command("powershell", "-Command", scriptPS).Run()
	}

	exec.Command(exeDestino).Start()
	os.Exit(0)

	return "SUCESSO"
}

func (a *App) criarAtalhoMenuIniciar(caminhoExe string) {
    appData, _ := os.UserConfigDir()
    // Caminho padrão do Menu Iniciar do usuário
    caminhoMenu := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Setup Deck.lnk")
    
    scriptPS := fmt.Sprintf(`$s=(New-Object -COM WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.Save()`, 
        caminhoMenu, caminhoExe, filepath.Dir(caminhoExe))
        
    exec.Command("powershell", "-Command", scriptPS).Run()
}

type ResultadoAtualizacao struct {
	TemAtualizacao bool   `json:"temAtualizacao"`
	Versao         string `json:"versao"`
	Link           string `json:"link"`
}

func (a *App) VerificarAtualizacaoApp() ResultadoAtualizacao {
	url := "https://api.github.com/repos/Samuel-SSLabs/Setup-Deck/releases/latest"
	resp, err := http.Get(url)
	if err != nil || resp.StatusCode != 200 {
		return ResultadoAtualizacao{false, "", ""}
	}
	defer resp.Body.Close()

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			BrowserDownloadUrl string `json:"browser_download_url"`
		} `json:"assets"`
	}
	json.NewDecoder(resp.Body).Decode(&release)

	nova := parseVersao(release.TagName)
	atual := parseVersao(VERSAO_APP_ATUAL)

	if nova > atual && len(release.Assets) > 0 {
		return ResultadoAtualizacao{true, release.TagName, release.Assets[0].BrowserDownloadUrl}
	}
	
	return ResultadoAtualizacao{false, "", ""}
}

func (a *App) AbrirLinkDownload(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

func (a *App) ExecutarAtualizacaoApp(urlDownload string) string {
	exeAtual, _ := os.Executable()
	appData, _ := os.UserConfigDir()
	pastaOficial := filepath.Join(appData, "SetupDeck")

	// Se não estiver na pasta oficial, é portátil (abre navegador)
	if !strings.HasPrefix(exeAtual, pastaOficial) {
		runtime.BrowserOpenURL(a.ctx, urlDownload)
		return "PORTATIL"
	}

	exeOficial := filepath.Join(pastaOficial, "Setup Deck.exe")
	exeTemporario := filepath.Join(pastaOficial, "Setup Deck.tmp")

	resp, err := http.Get(urlDownload)
	if err != nil || resp.StatusCode != 200 { return "ERRO: Falha ao baixar." }
	defer resp.Body.Close()

	out, _ := os.Create(exeTemporario)
	io.Copy(out, resp.Body)
	out.Close()

	exeVelho := filepath.Join(pastaOficial, "Setup Deck.old")
	os.Remove(exeVelho)
	os.Rename(exeOficial, exeVelho)
	os.Rename(exeTemporario, exeOficial)

	a.criarAtalhoMenuIniciar(exeOficial)

	// Inicia a nova versão desvinculada
	cmd := exec.Command(exeOficial)
	cmd.SysProcAttr = &syscall.SysProcAttr{
        CreationFlags: 0x08000200, 
        }
	err = cmd.Start()
	
	if err != nil { return "ERRO: Falha ao iniciar nova versão" }

	os.Exit(0)
	return "SUCESSO"
}