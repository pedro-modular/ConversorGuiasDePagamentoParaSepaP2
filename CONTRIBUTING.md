# Contributing to Guias de Pagamento SEPA

Thank you for considering contributing to this project. This document outlines the process for contributing and provides guidelines to make the process smooth for everyone involved.

## Project Philosophy

This is an open source project created to solve a real problem in the Portuguese business community. The goal is to provide a reliable, free tool that helps people process tax payment guides efficiently. Contributions should align with this goal.

The project prioritizes:
- Reliability over features
- Privacy and offline operation
- Simple, maintainable code
- Clear documentation

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue on GitHub with:

1. A clear description of the problem
2. Steps to reproduce the issue
3. Expected behavior vs actual behavior
4. Your environment (Windows version, application version)
5. If possible, attach a sample PDF (redact sensitive information)

Before opening a new issue, please search existing issues to avoid duplicates.

### Suggesting Features

Feature requests are welcome. When suggesting a feature:

1. Explain the problem you are trying to solve
2. Describe your proposed solution
3. Consider whether it fits the project's goals
4. Be open to discussion about alternative approaches

Keep in mind that this project has limited scope. Features that significantly increase complexity or require external services may not be accepted.

### Contributing Code

#### Before You Start

1. Check if there is an existing issue for what you want to work on
2. If not, open an issue to discuss your proposed changes
3. Wait for feedback before investing significant time in implementation

This saves time and ensures your contribution will be accepted.

#### Development Process

1. Fork the repository
2. Create a new branch from main:
   ```bash
   git checkout -b fix-issue-123
   ```
3. Make your changes
4. Test thoroughly on Windows (use a VM if necessary)
5. Commit with clear, descriptive messages
6. Push to your fork
7. Open a pull request

#### Code Guidelines

**General Principles**
- Write clear, readable code
- Add comments for complex logic
- Keep functions small and focused
- Use TypeScript types properly
- Follow the existing code style

**Testing**
- Test your changes on Windows (the primary target platform)
- Run the existing test suite: `npm run test:build`
- Add tests for new functionality where appropriate
- Verify that OCR still works correctly if you modify PDF processing

**Commits**
- Write clear commit messages that explain why, not just what
- Keep commits focused on a single change
- Reference issue numbers where applicable

**Pull Requests**
- Provide a clear description of what your PR does
- Explain why the change is needed
- Include screenshots for UI changes
- Link to related issues
- Be responsive to feedback

#### What Makes a Good Pull Request

Good:
- Fixes a specific bug or adds a well-defined feature
- Includes tests
- Updates documentation as needed
- Maintains or improves code quality
- Is focused on one thing

Avoid:
- Large refactors without prior discussion
- Mixing multiple unrelated changes
- Breaking existing functionality
- Adding unnecessary dependencies
- Changing code style throughout the project

## Technical Considerations

### Windows Compatibility

This application primarily targets Windows. All changes must work correctly on Windows 10 and Windows 11. If you develop on macOS or Linux, you must test on Windows before submitting.

### Native Modules

The canvas module is a native addon. Be very careful when:
- Updating the canvas version
- Modifying the afterPack hook
- Changing how PDFs are rendered

These changes can break Windows builds in ways that are not obvious on macOS.

### OCR Performance

OCR is resource-intensive. Changes that affect OCR should be tested with:
- High-quality PDFs
- Low-quality scanned PDFs
- Large PDFs
- PDFs with unusual layouts

### SEPA XML Format

The SEPA XML format must comply with ISO 20022 pain.001.001.03 standard. If you modify SEPA generation:
- Verify compliance with the standard
- Test with actual banking systems if possible
- Document any deviations or assumptions

## Documentation

All user-facing features should be documented in the README. If you add a new feature or change existing behavior, update the documentation accordingly.

Write documentation clearly and simply. Assume the reader is not a developer.

## Code of Conduct

This project does not have a formal code of conduct, but contributors are expected to:
- Be respectful and professional
- Focus on the technical merits of contributions
- Accept constructive criticism gracefully
- Help maintain a welcoming environment

Harassment, personal attacks, or other unprofessional behavior will not be tolerated.

## Questions

If you have questions about contributing, open an issue labeled "question" or contact the maintainer directly.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
