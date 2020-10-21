const algorithmia = require('algorithmia')
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey
const sentenceBoundaryDetection = require('sbd')

const watsonApiKey = require('../credentials/watson-nlu.json').apikey

const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
const { IamAuthenticator } = require('ibm-watson/auth');
 
const nlu = new NaturalLanguageUnderstandingV1({
  authenticator: new IamAuthenticator({ apikey: watsonApiKey }),
  version: '2018-04-05',
  serviceUrl: 'https://gateway.watsonplatform.net/natural-language-understanding/api/'
});

const state = require('./state.js')

async function robot(){
    const content = state.load()

    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaximumSentence(content)
    await fetchKeywordsOfAllSentences(content)

    state.save(content)

    async function fetchContentFromWikipedia(content) {
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
        const wikipediaAlgorithmia = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2')
        const wikipediaResponse = await wikipediaAlgorithmia.pipe(content.searchTerm)
        const wikipediaContent = wikipediaResponse.get()
        
        content.sourceContentOriginal = wikipediaContent.content
    }

    function sanitizeContent(content){
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal)
        const withoutDatesInParentheses = removeDateInParentheses(withoutBlankLinesAndMarkdown)
        
        content.sourceContentSinetized = withoutDatesInParentheses

        function removeBlankLinesAndMarkdown(text){
            const allLines = text.split('\n')

            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if (line.trim().length === 0 || line.trim().startsWith('=')){
                    return false
                }

                return true
            })

            return withoutBlankLinesAndMarkdown.join(' ')
        }

        function removeDateInParentheses(text){
            return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g, ' ')
        }
        
    }
    function breakContentIntoSentences(content){
        content.sentences = []

        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSinetized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }

    function limitMaximumSentence(content){
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }

    async function fetchKeywordsOfAllSentences(content) {
        for (const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
        }
    }

    async function fetchWatsonAndReturnKeywords(sentence) {
        return new Promise((resolve, reject) => {
          nlu.analyze({
            text: sentence,
            features: {
              keywords: {}
            }
          }, (error, response) => {
            if (error) {
              reject(error)
              return
            }
    
            const keywords = response.result.keywords.map((keyword) => {
              return keyword.text
            })
    
            resolve(keywords)
          })
        })
      }

}

module.exports = robot