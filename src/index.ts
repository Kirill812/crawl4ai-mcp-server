#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

interface CrawlRequest {
    urls: string[];
}

const API_URL = process.env.CRAWL4AI_API_URL || 'http://127.0.0.1:11235';
const AUTH_TOKEN = process.env.CRAWL4AI_AUTH_TOKEN;

// Default crawler configuration
const DEFAULT_CONFIG = {
    priority: 10,
    magic: true,
    crawler_params: {
        headless: true,
        page_timeout: 30000,
        remove_overlay_elements: true,
        browser_type: "chromium",
        scan_full_page: true,
        user_agent_mode: "random",
        user_agent_generator_config: {
            device_type: "mobile",
            os_type: "android"
        }
    },
    bypass_cache: true,
    ignore_images: true
};

const isValidCrawlRequest = (args: any): args is CrawlRequest => {
    if (!args || typeof args !== 'object') return false;
    if (!Array.isArray(args.urls) || !args.urls.every((url: string) => typeof url === 'string')) return false;
    return true;
};

// Utility function to extract markdown content from various response formats
const extractMarkdown = (result: any): string => {
    // Try to get markdown from different possible locations in the response
    if (result.markdown_v2 && result.markdown_v2.markdown_with_citations) {
        return result.markdown_v2.markdown_with_citations;
    } else if (result.markdown) {
        return result.markdown;
    } else if (typeof result === 'string') {
        return result;
    } else {
        console.error('Cannot extract markdown from result:', JSON.stringify(result).substring(0, 200) + '...');
        return 'Error: No markdown content available for this URL';
    }
};

class Crawl4AIServer {
    private server: Server;
    private axiosInstance;
    private retryCount = 3; // Number of retries for API calls

    constructor() {
        this.server = new Server(
            {
                name: 'crawl4ai-mcp',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Setup axios instance with authentication if token is provided
        const headers: Record<string, string> = {};
        if (AUTH_TOKEN) {
            headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
            console.error(`Setting Authorization header: Bearer ${AUTH_TOKEN}`);
        } else {
            console.error('No AUTH_TOKEN provided');
        }

        this.axiosInstance = axios.create({
            baseURL: API_URL,
            headers,
            // Add timeout to prevent hanging requests
            timeout: 60000, // 60 seconds
        });

        this.setupToolHandlers();
        
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'crawl_urls',
                    description: 'Crawl one or more URLs and return markdown content with citations',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            urls: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'Array of URLs to crawl'
                            }
                        },
                        required: ['urls']
                    }
                }
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== 'crawl_urls') {
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: ${request.params.name}`
                );
            }

            if (!isValidCrawlRequest(request.params.arguments)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Invalid crawl request parameters'
                );
            }

            // Log the request for debugging
            console.error(`Crawling URLs: ${request.params.arguments.urls.join(', ')}`);
            console.error(`API URL: ${API_URL}`);
            console.error(`Authentication enabled: ${!!AUTH_TOKEN}`);

            try {
                // Make the API request with retry logic
                let response;
                let lastError;
                
                for (let attempt = 1; attempt <= this.retryCount; attempt++) {
                    try {
                        // Try using the same approach that worked in our test script
                        console.error('API_URL:', API_URL);
                        console.error('AUTH_TOKEN:', AUTH_TOKEN);
                        
                        // Create request headers with proper authentication
                        const requestHeaders: Record<string, string> = {};
                        if (AUTH_TOKEN) {
                            requestHeaders['Authorization'] = `Bearer ${AUTH_TOKEN}`;
                            console.error('Using authentication token from environment');
                        } else {
                            console.error('No authentication token provided');
                        }
                        
                        response = await axios.post(`${API_URL}/crawl_direct`, {
                            ...DEFAULT_CONFIG,
                            urls: request.params.arguments.urls
                        }, {
                            headers: requestHeaders
                        });
                        break; // If successful, exit the retry loop
                    } catch (error) {
                        lastError = error;
                        console.error(`Attempt ${attempt}/${this.retryCount} failed:`, error instanceof Error ? error.message : String(error));
                        
                        if (attempt < this.retryCount) {
                            // Wait before retrying (exponential backoff)
                            const delay = 1000 * Math.pow(2, attempt - 1);
                            console.error(`Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }
                }
                
                // If all retries failed, throw the last error
                if (!response) {
                    throw lastError;
                }
                
                // Validate the response
                if (!response.data) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        'Empty response from crawling service'
                    );
                }

                // Handle different response formats
                let results = [];
                if (response.data.results && Array.isArray(response.data.results)) {
                    results = response.data.results;
                } else if (Array.isArray(response.data)) {
                    results = response.data;
                } else {
                    results = [response.data]; // Treat the whole response as a single result
                }

                // Extract markdown from each result
                const markdownResults = results.map((result: any) => {
                    return extractMarkdown(result);
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: markdownResults.join('\n\n---\n\n')
                        }
                    ]
                };

            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const statusCode = error.response?.status;
                    const message = error.response?.data?.message || 
                                   error.response?.data?.detail || 
                                   error.message;
                    
                    console.error(`API Error (${statusCode}):`, message);
                    
                    // Include the request URL and method in the error message
                    const requestInfo = error.config ? 
                        `${error.config.method?.toUpperCase()} ${error.config.url}` : 
                        'Unknown request';
                    
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Crawling service error (${statusCode}) for ${requestInfo}: ${message}`
                            }
                        ],
                        isError: true
                    };
                }
                
                console.error('Non-Axios error:', error);
                throw error;
            }
        });
    }

    async run() {
        try {
            const transport = new StdioServerTransport();
            console.error('Initializing Crawl4AI MCP server...');
            await this.server.connect(transport);
            console.error('Crawl4AI MCP server running on stdio');
            
            // Test API connection on startup
            try {
                await this.axiosInstance.get('/health');
                console.error('Successfully connected to Crawl4AI API');
            } catch (error) {
                console.error('Warning: Could not connect to Crawl4AI API:', error instanceof Error ? error.message : String(error));
                console.error('The server will still run, but API calls may fail until the connection is restored');
            }
        } catch (error) {
            console.error('Failed to start MCP server:', error);
            process.exit(1);
        }
    }
}

const server = new Crawl4AIServer();
server.run().catch(console.error);