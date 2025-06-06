<div align="center">


</div>
<br>
<div align="center">
<img src="https://github.com/TRMRai/TRMRai/blob/master/media/TRMRHORZ.png" width = 70%" />
  
  <p align="center">


<img src="https://github.com/TRMRai/TRMRai/blob/master/media/trmr_demo.gif" width="100%" />

  </p>
  
  
</div>
<br>
<br>

<div align="center">


</div>

**TRMR.ai** is an **autonomous ai coding agent** that lives in your editor. It can:

- Communicate in natural language
- Read and write files directly in your workspace
- Run terminal commands
- Automate browser actions
- Integrate with any OpenAI-compatible or custom API/model
- Adapt its “personality” and capabilities through **Custom Modes**

From coding assistance to system design, QA testing to product management, TRMR.ai adapts to your needs, helping you build better software faster.

Check out the [CHANGELOG](CHANGELOG.md) for detailed updates and fixes.

---

## 🎉 TRMR.ai 3.18 Released

TRMR.ai 3.18 brings powerful new features and improvements based on your feedback!

- **Gemini 2.5 Flash Models** - Experience lightning-fast responses with our latest Gemini Flash model integration
- **Smart Context Compression** - Streamline your workflow with our new intelligent content condensing feature
- **YAML Mode Configuration** - Simplify mode creation and customization with YAML-based definitions

---

## What Can TRMR.ai Do?

- 🚀 **Generate Code** from natural language descriptions
- 🔧 **Refactor & Debug** existing code
- 📝 **Write & Update** documentation
- 🤔 **Answer Questions** about your codebase
- 🔄 **Automate** repetitive tasks
- 🏗️ **Create** new files and projects

## Quick Start

1. [Install TRMR.ai](https://docs.trmr.ai/getting-started/installing)
2. [Connect Your AI Provider](https://docs.trmr.ai/getting-started/connecting-api-provider)
3. [Try Your First Task](https://docs.trmr.ai/getting-started/your-first-task)

## Key Features

### Multiple Modes

TRMR.ai adapts to your needs with specialized [modes](https://docs.trmr.ai/basic-usage/using-modes):

- **Code Mode:** For general-purpose coding tasks
- **Architect Mode:** For planning and technical leadership
- **Ask Mode:** For answering questions and providing information
- **Debug Mode:** For systematic problem diagnosis
- **[Custom Modes](https://docs.trmr.ai/advanced-usage/custom-modes):** Create unlimited specialized personas for security auditing, performance optimization, documentation, or any other task

### Smart Tools

TRMR.ai comes with powerful [tools](https://docs.trmr.ai/basic-usage/how-tools-work) that can:

- Read and write files in your project
- Execute commands in your VS Code terminal
- Control a web browser
- Use external tools via [MCP (Model Context Protocol)](https://docs.trmr.ai/advanced-usage/mcp)

MCP extends TRMR.ai's capabilities by allowing you to add unlimited custom tools. Integrate with external APIs, connect to databases, or create specialized development tools - MCP provides the framework to expand TRMR.ai's functionality to meet your specific needs.

### Customization

Make TRMR.ai work your way with:

- [Custom Instructions](https://docs.trmr.ai/advanced-usage/custom-instructions) for personalized behavior
- [Custom Modes](https://docs.trmr.ai/advanced-usage/custom-modes) for specialized tasks
- [Local Models](https://docs.trmr.ai/advanced-usage/local-models) for offline use
- [Auto-Approval Settings](https://docs.trmr.ai/advanced-usage/auto-approving-actions) for faster workflows

## Resources

### Documentation

- [Basic Usage Guide](https://docs.trmr.ai/basic-usage/the-chat-interface)
- [Advanced Features](https://docs.trmr.ai/advanced-usage/auto-approving-actions)
- [Frequently Asked Questions](https://docs.trmr.ai/faq)

### Community

- **Discord:** [Join our Discord server](https://discord.gg/roocode) for real-time help and discussions
- **Reddit:** [Visit our subreddit](https://www.reddit.com/r/RooCode) to share experiences and tips
- **GitHub:** Report [issues](https://github.com/TRMRai/TRMRai/issues) or request [features](https://github.com/TRMRai/TRMRai/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop)

---

## Local Setup & Development

1. **Clone** the repo:

```sh
git clone https://github.com/TRMRai/TRMRai.git
```

2. **Install dependencies**:

```sh
pnpm install
```

3. **Run the extension**:

Press `F5` (or **Run** → **Start Debugging**) in VSCode to open a new window with TRMR.ai running.

Changes to the webview will appear immediately. Changes to the core extension will require a restart of the extension host.

Alternatively you can build a .vsix and install it directly in VSCode:

```sh
pnpm build
```

A `.vsix` file will appear in the `bin/` directory which can be installed with:

```sh
code --install-extension bin/roo-cline-<version>.vsix
```

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing. Check our `CHANGELOG.md` for release notes.

---

## Disclaimer

**Please note** that TRMR.ai, Inc does **not** make any representations or warranties regarding any code, models, or other tools provided or made available in connection with TRMR.ai, any associated third-party tools, or any resulting outputs. You assume **all risks** associated with the use of any such tools or outputs; such tools are provided on an **"AS IS"** and **"AS AVAILABLE"** basis. Such risks may include, without limitation, intellectual property infringement, cyber vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or outputs (including, without limitation, the legality, appropriateness, and results thereof).

---

## Contributing

We love community contributions! Get started by reading our [CONTRIBUTING.md](CONTRIBUTING.md).

---


## License

[Apache 2.0 © 2025 TRMR.ai, Inc.](./LICENSE)

---

**Enjoy TRMR.ai!** Whether you keep it on a short leash or let it roam autonomously, we can’t wait to see what you build. Happy coding!
