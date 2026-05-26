package main

import (
	"context"
	"embed"
	"os"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	iniciarEscondido := false
	for _, arg := range os.Args {
		if arg == "-hidden" {
			iniciarEscondido = true
			break
		}
	}

	onReady := func() {
		systray.SetTooltip("Setup Deck")

		tema := app.LerTema()
		iconName := "frontend/dist/assets/icon-" + tema + ".ico"
		iconData, err := assets.ReadFile(iconName)
		if err != nil {
			iconData, _ = assets.ReadFile("frontend/dist/assets/icon.ico")
		}
		systray.SetIcon(iconData)

		mOpen := systray.AddMenuItem("Abrir Setup Deck", "Abre a janela de configuração")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Sair", "Encerra o aplicativo")

		go func() {
			for {
				select {
				case <-mOpen.ClickedCh:
					if app.ctx != nil {
						go func() {
							runtime.WindowShow(app.ctx)
							runtime.WindowUnminimise(app.ctx) 
						}()
					}
				case <-mQuit.ClickedCh:
					go func() {
						systray.Quit()
						if app.ctx != nil {
							runtime.Quit(app.ctx)
						} else {
							os.Exit(0)
						}
					}()
				}
			}
		}()
	}

	go systray.Run(onReady, func() {})

	err := wails.Run(&options.App{
		Title:       "Setup Deck",
		Width:       1024,
		Height:      768,
		Frameless:   true,
		StartHidden: iniciarEscondido,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown: func(ctx context.Context) {
			systray.Quit()
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}