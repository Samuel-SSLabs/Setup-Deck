# 🎛️ Setup Deck

[![Baixar Setup Deck](https://img.shields.io/badge/Baixar-Setup_Deck-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://samuel-sslabs.github.io/Setup-Deck/)
[![Wails](https://img.shields.io/badge/Wails-v2-red?style=flat-square&logo=go)](https://wails.io/)
[![Plataforma](https://img.shields.io/badge/Plataforma-Windows-blue?style=flat-square&logo=windows)](#)

O **Setup Deck** é o software de controle oficial e definitivo para o seu hardware de macro pad customizado. Desenvolvido com Go (backend) e HTML/JS (frontend) através do framework Wails, ele oferece uma comunicação Serial USB de baixíssima latência combinada com uma interface gráfica rica e responsiva.

---

## ✨ Recursos Principais

* **Gerenciamento Visual Completo:** Configure ações para cliques **Curtos** e **Longos** através de uma interface intuitiva, visualizando exatamente o que cada botão faz diretamente na representação virtual da Deck.
* **Perfis Ilimitados:** Crie, salve e alterne entre diferentes perfis de atalhos dependendo do aplicativo ou jogo que você está utilizando.
* **Temas Dinâmicos:** Personalize a interface com diferentes temas (Volt, Pink, Cyan, etc.). O ícone do aplicativo na bandeja do sistema muda dinamicamente para acompanhar o tema escolhido.
* **Comunicação Serial Robusta:** Sistema de *heartbeat* e reconexão automática. Se a Deck for desconectada, o app pausa; ao reconectar, a sincronização é imediata.
* **Estatísticas de Uso:** Acompanhe o ciclo de vida do seu hardware com um contador de cliques global e individual por botão.

---

## 🚀 Novas Implementações (Versões Recentes)

O Setup Deck agora se comporta como um software comercial de alto nível graças às implementações de sistema nativo:

* 🔄 **Atualizações Híbridas Automáticas (OTA):** O aplicativo consulta a API do GitHub Releases de forma silenciosa. Ao detectar uma nova versão, ele faz o download, substitui os executáveis, recria os atalhos e reabre sozinho — tudo de forma transparente para o usuário.
* ☁️ **Atualização de Firmware via Nuvem:** O app conecta sua Deck diretamente à nuvem para baixar e injetar a última versão do firmware em Python/C++ no microcontrolador via porta Serial.
* ⚡ **Bypass de Prevenção de Foco (Windows):** Ao ser chamado pela bandeja ou por atalho de teclado, o aplicativo utiliza ciclos rápidos de ocultação e reexibição (`Hide/Show`) para ignorar o bloqueio nativo do Windows e saltar instantaneamente para o primeiro plano.
* ⚙️ **Sincronização de Auto-Start:** Leitura dinâmica e bidirecional. O aplicativo lê o Registro do Windows e a pasta *Startup* para garantir que a interface sempre reflita o status real de inicialização, evitando processos duplicados.
* 🖱️ **Bandeja de Sistema (Systray) Refinada:** Mapeamento forçado de cliques (esquerdo e direito) para garantir resposta imediata e evitar o congelamento padrão do menu de contexto do Windows.

---

## 📥 Instalação

1. Acesse a [Página Oficial de Download](https://samuel-sslabs.github.io/Setup-Deck/).
2. Baixe o executável mais recente.
3. Você pode rodá-lo de forma **Portátil** (direto da pasta de download) ou usar a opção **Instalar Completo** dentro do próprio aplicativo, que criará atalhos no Menu Iniciar, Desktop e configurará a pasta de sistema padrão.

---

## 🛠️ Para Desenvolvedores (Como Compilar)

Este projeto utiliza o [Wails](https://wails.io/) para integrar o backend em Go com o frontend web.

### Pré-requisitos
* [Go](https://golang.org/dl/) 1.18+
* Node.js e NPM
* Wails CLI instalada (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### Compilando para Produção
Para gerar o executável final `.exe` otimizado, ocultando o console do sistema e embutindo todos os assets:

```bash
wails build -clean -nsis
