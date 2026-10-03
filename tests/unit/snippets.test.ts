import { describe, expect, it } from 'vitest'
import { formHtml, formScript, scriptLiteral, snippetFields } from '../../lib/snippets'

describe('snippetFields', () => {
  it('infers input types from rules', () => {
    expect(
      snippetFields([
        { id: 'email', order: 1, label: 'Email', rules: ['required', 'email'] },
        { id: 'site', order: 2, rules: ['url'] },
        { id: 'age', order: 3, rules: ['numeric'] },
        { id: 'message', order: 4, rules: ['max:5000'] },
        { id: 'topic', order: 5, name: 'subject', rules: ['in:sales,support'] },
        { id: 'plain', order: 6 },
      ]).map(({ name, type, required }) => [name, type, required]),
    ).toEqual([
      ['email', 'email', true],
      ['site', 'url', false],
      ['age', 'number', false],
      ['message', 'textarea', false],
      ['subject', 'select', false],
      ['plain', 'text', false],
    ])
  })

  it('lists fields by `order`', () => {
    expect(
      snippetFields([
        { id: 'b', order: 2 },
        { id: 'a', order: 1 },
      ]).map((field) => field.name),
    ).toEqual(['a', 'b'])
  })

  it('treats an empty or null schema as no fields', () => {
    expect(snippetFields([])).toEqual([])
    expect(snippetFields(null)).toEqual([])
  })
})

describe('formHtml', () => {
  it('labels every input and adds the honeypot', () => {
    const html = formHtml({
      endpoint: 'https://api.example.com/api/v1/forms/01J/submissions',
      fields: snippetFields([
        { id: 'email', order: 1, label: 'Email', rules: ['required', 'email'] },
      ]),
      honeypotName: 'website_k3x9qa',
    })

    expect(html).toContain('action="https://api.example.com/api/v1/forms/01J/submissions"')
    expect(html).toContain('<label for="fh-1-email">Email</label>')
    expect(html).toContain('<input id="fh-1-email" name="email" required type="email">')
    expect(html).toContain('name="website_k3x9qa" type="text" tabindex="-1" autocomplete="off"')
    expect(html).toContain('aria-hidden="true"')
  })

  it('escapes hostile labels, names and options', () => {
    const html = formHtml({
      endpoint: 'https://api.example.com/x',
      fields: snippetFields([
        {
          id: 'x',
          order: 1,
          label: '"><script>alert(1)</script>',
          name: 'a"b',
          rules: ['in:<b>,c'],
        },
      ]),
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('name="a&quot;b"')
    expect(html).toContain('<option value="&lt;b&gt;">&lt;b&gt;</option>')
  })
})

describe('scriptLiteral / formScript', () => {
  it('cannot close the script element', () => {
    expect(scriptLiteral('</script><script>alert(1)')).not.toContain('</script>')
    expect(formScript('contact-form')).toContain('document.getElementById("contact-form")')
  })
})
