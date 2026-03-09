#include <string>
#include <vector>
#include <unordered_map>
#include <map>
#include <algorithm>
#include <cmath>
#include <sstream>
#include <cstring>
#include <climits>

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

struct Style {
    std::string fill = "#ffffff";
    std::string stroke = "#333333";
    std::string fontColor = "#333333";
    std::string fontFamily = "Segoe UI, Arial, sans-serif";
    float strokeWidth = 1.0f;
    float fontSize = 12.0f;
    bool filled = false, rounded = false, dashed = false, dotted = false, bold = false;
};

struct EdgeStyle {
    std::string stroke = "#333333";
    std::string fontColor = "#555555";
    std::string fontFamily = "Segoe UI, Arial, sans-serif";
    float strokeWidth = 1.2f;
    float fontSize = 10.0f;
    bool dashed = false, dotted = false, bold = false, invis = false;
};

struct Node {
    std::string id, label, shape;
    float x = 0, y = 0, w = 0, h = 0;
    int layer = -1;
    int order = 0;
    std::string cluster;
    Style style;
    std::map<std::string, std::string> attrs;
};

struct Edge {
    std::string from, fromPort, to, toPort, label;
    EdgeStyle style;
    std::map<std::string, std::string> attrs;
};

struct Cluster {
    std::string id, label;
    std::vector<std::string> children;
    std::vector<std::string> subclusters;
    Style style;
    float x = 0, y = 0, w = 0, h = 0;
    std::map<std::string, std::string> attrs;
};

struct Graph {
    bool directed = true;
    std::vector<std::string> nodeOrder;
    std::unordered_map<std::string, Node> nodes;
    std::vector<Edge> edges;
    std::unordered_map<std::string, Cluster> clusters;
    std::map<std::string, std::string> graphAttrs;
    std::map<std::string, std::string> nodeDefaults;
    std::map<std::string, std::string> edgeDefaults;
};

// ═══════════════════════════════════════════════════════════════
//  TOKENIZER
// ═══════════════════════════════════════════════════════════════

enum TType { T_ID, T_STR, T_HTML, T_LBRACE, T_RBRACE, T_LBRACK, T_RBRACK,
             T_EQ, T_SEMI, T_COMMA, T_COLON, T_ARROW, T_DASH, T_EOF };

struct Token { TType type; std::string value; };

static std::vector<Token> tokenize(const std::string& src) {
    std::vector<Token> tokens;
    size_t i = 0, n = src.size();

    while (i < n) {
        if (std::isspace(src[i])) { i++; continue; }
        if (i + 1 < n && src[i] == '/' && src[i+1] == '/') { while (i < n && src[i] != '\n') i++; continue; }
        if (i + 1 < n && src[i] == '/' && src[i+1] == '*') { i += 2; while (i + 1 < n && !(src[i] == '*' && src[i+1] == '/')) i++; i += 2; continue; }
        if (i + 1 < n && src[i] == '-' && src[i+1] == '>') { tokens.push_back({T_ARROW, "->"}); i += 2; continue; }
        if (i + 1 < n && src[i] == '-' && src[i+1] == '-') { tokens.push_back({T_DASH, "--"}); i += 2; continue; }

        switch (src[i]) {
            case '{': tokens.push_back({T_LBRACE, "{"}); i++; continue;
            case '}': tokens.push_back({T_RBRACE, "}"}); i++; continue;
            case '[': tokens.push_back({T_LBRACK, "["}); i++; continue;
            case ']': tokens.push_back({T_RBRACK, "]"}); i++; continue;
            case '=': tokens.push_back({T_EQ, "="}); i++; continue;
            case ';': tokens.push_back({T_SEMI, ";"}); i++; continue;
            case ',': tokens.push_back({T_COMMA, ","}); i++; continue;
            case ':': tokens.push_back({T_COLON, ":"}); i++; continue;
        }

        if (src[i] == '<' && (i == 0 || src[i-1] == '=' || std::isspace(src[i-1]))) {
            int depth = 1; size_t start = i; i++;
            while (i < n && depth > 0) { if (src[i] == '<') depth++; if (src[i] == '>') depth--; i++; }
            tokens.push_back({T_HTML, src.substr(start + 1, i - start - 2)});
            continue;
        }

        if (src[i] == '"') {
            std::string s; i++;
            while (i < n && src[i] != '"') {
                if (src[i] == '\\' && i + 1 < n) { s += src[i+1]; i += 2; }
                else { s += src[i]; i++; }
            }
            i++;
            tokens.push_back({T_STR, s});
            continue;
        }

        if (std::isalnum(src[i]) || src[i] == '_' || src[i] == '.' || src[i] == '#') {
            std::string s;
            while (i < n && (std::isalnum(src[i]) || src[i] == '_' || src[i] == '.' || src[i] == '#'))
                { s += src[i]; i++; }
            tokens.push_back({T_ID, s});
            continue;
        }
        i++;
    }
    tokens.push_back({T_EOF, ""});
    return tokens;
}

// ═══════════════════════════════════════════════════════════════
//  PARSER
// ═══════════════════════════════════════════════════════════════

class Parser {
    std::vector<Token>& tok;
    size_t pos = 0;
    Graph& g;

    Token& peek() { return tok[std::min(pos, tok.size()-1)]; }
    Token next() { return tok[std::min(pos++, tok.size()-1)]; }
    bool match(TType t) { if (peek().type == t) { next(); return true; } return false; }
    bool isId() { return peek().type == T_ID || peek().type == T_STR; }

    std::string readId() {
        auto t = next();
        return t.value;
    }

    struct NodeId {
        std::string id, port;
    };

    NodeId readNodeId() {
        NodeId nid;
        nid.id = readId();
        while (peek().type == T_COLON) { 
            next(); 
            if (isId()) nid.port = readId(); 
        }
        return nid;
    }

    std::string stripHtml(const std::string& s) {
        std::string r;
        bool inTag = false;
        for (char c : s) {
            if (c == '<') inTag = true;
            else if (c == '>') inTag = false;
            else if (!inTag) r += c;
        }
        // Replace &amp; etc
        std::string out;
        for (size_t i = 0; i < r.size(); i++) {
            if (r.substr(i, 5) == "&amp;") { out += '&'; i += 4; }
            else if (r.substr(i, 4) == "&lt;") { out += '<'; i += 3; }
            else if (r.substr(i, 4) == "&gt;") { out += '>'; i += 3; }
            else out += r[i];
        }
        // Trim
        size_t s1 = out.find_first_not_of(" \t\n\r");
        size_t s2 = out.find_last_not_of(" \t\n\r");
        if (s1 == std::string::npos) return "";
        return out.substr(s1, s2 - s1 + 1);
    }

    Style parseStyle(const std::map<std::string, std::string>& a, const std::map<std::string, std::string>& def = {}) {
        Style s;
        auto get = [&](const std::string& key) -> std::string {
            auto it = a.find(key); if (it != a.end()) return it->second;
            auto it2 = def.find(key); if (it2 != def.end()) return it2->second;
            return "";
        };
        std::string st = get("style");
        s.filled = st.find("filled") != std::string::npos;
        s.rounded = st.find("rounded") != std::string::npos;
        s.dashed = st.find("dashed") != std::string::npos;
        s.dotted = st.find("dotted") != std::string::npos;
        s.bold = st.find("bold") != std::string::npos;
        if (!get("fillcolor").empty()) s.fill = get("fillcolor");
        else if (s.filled && !get("color").empty()) s.fill = get("color");
        if (!get("color").empty()) s.stroke = get("color");
        if (!get("penwidth").empty()) s.strokeWidth = std::stof(get("penwidth"));
        if (!get("fontname").empty()) s.fontFamily = get("fontname");
        if (!get("fontsize").empty()) s.fontSize = std::stof(get("fontsize"));
        if (!get("fontcolor").empty()) s.fontColor = get("fontcolor");
        return s;
    }

    EdgeStyle parseEdgeStyle(const std::map<std::string, std::string>& a) {
        EdgeStyle s;
        auto get = [&](const std::string& key) -> std::string {
            auto it = a.find(key); if (it != a.end()) return it->second;
            auto it2 = g.edgeDefaults.find(key); if (it2 != g.edgeDefaults.end()) return it2->second;
            return "";
        };
        std::string st = get("style");
        s.dashed = st.find("dashed") != std::string::npos;
        s.dotted = st.find("dotted") != std::string::npos;
        s.bold = st.find("bold") != std::string::npos;
        s.invis = st.find("invis") != std::string::npos;
        if (!get("color").empty()) s.stroke = get("color");
        if (!get("penwidth").empty()) s.strokeWidth = std::stof(get("penwidth"));
        if (!get("fontname").empty()) s.fontFamily = get("fontname");
        if (!get("fontsize").empty()) s.fontSize = std::stof(get("fontsize"));
        if (!get("fontcolor").empty()) s.fontColor = get("fontcolor");
        return s;
    }

    std::map<std::string, std::string> parseAttrs() {
        std::map<std::string, std::string> attrs;
        next(); // [
        while (peek().type != T_RBRACK && peek().type != T_EOF) {
            if (peek().type == T_COMMA || peek().type == T_SEMI) { next(); continue; }
            std::string key = readId();
            if (match(T_EQ)) {
                if (peek().type == T_HTML) attrs[key] = next().value;
                else attrs[key] = readId();
            } else {
                attrs[key] = "true";
            }
        }
        match(T_RBRACK);
        return attrs;
    }

    void ensureNode(const std::string& id, const std::map<std::string, std::string>& attrs, const std::string& clusterId) {
        auto it = g.nodes.find(id);
        if (it == g.nodes.end()) {
            Node node;
            node.id = id;
            std::map<std::string, std::string> merged = g.nodeDefaults;
            for (auto& kv : attrs) merged[kv.first] = kv.second;
            node.attrs = merged;
            auto labelIt = merged.find("label");
            if (labelIt != merged.end()) {
                node.label = stripHtml(labelIt->second);
                // Replace \n with newline
                std::string& lb = node.label;
                for (size_t p = lb.find("\\n"); p != std::string::npos; p = lb.find("\\n", p))
                    { lb.replace(p, 2, "\n"); }
            } else {
                node.label = id;
            }
            auto shapeIt = merged.find("shape");
            node.shape = shapeIt != merged.end() ? shapeIt->second : "box";
            node.style = parseStyle(merged, g.nodeDefaults);
            node.cluster = clusterId;
            g.nodes[id] = node;
            g.nodeOrder.push_back(id);
        } else {
            if (!attrs.empty()) {
                for (auto& kv : attrs) it->second.attrs[kv.first] = kv.second;
                auto labelIt = it->second.attrs.find("label");
                if (labelIt != it->second.attrs.end()) {
                    it->second.label = stripHtml(labelIt->second);
                    std::string& lb = it->second.label;
                    for (size_t p = lb.find("\\n"); p != std::string::npos; p = lb.find("\\n", p))
                        { lb.replace(p, 2, "\n"); }
                }
                auto shapeIt = it->second.attrs.find("shape");
                if (shapeIt != it->second.attrs.end()) it->second.shape = shapeIt->second;
                it->second.style = parseStyle(it->second.attrs, g.nodeDefaults);
            }
            if (it->second.cluster.empty() && !clusterId.empty()) it->second.cluster = clusterId;
        }
        if (!clusterId.empty()) {
            auto& cl = g.clusters[clusterId];
            if (std::find(cl.children.begin(), cl.children.end(), id) == cl.children.end())
                cl.children.push_back(id);
        }
    }

    void parseBody(const std::string& clusterId) {
        while (peek().type != T_RBRACE && peek().type != T_EOF) {
            size_t startPos = pos;
            parseStmt(clusterId);
            match(T_SEMI);
            if (pos == startPos) {
                // Prevent infinite loop on unexpected tokens
                next();
            }
        }
    }

    void parseStmt(const std::string& clusterId) {
        // Subgraph
        if (peek().value == "subgraph") {
            next();
            std::string id = isId() ? readId() : ("_anon_" + std::to_string(pos));
            if (peek().type == T_LBRACE) {
                next();
                Cluster& cl = g.clusters[id];
                cl.id = id;
                std::string strippedLabel = id;
                if (strippedLabel.substr(0, 8) == "cluster_") strippedLabel = strippedLabel.substr(8);
                else if (strippedLabel.substr(0, 7) == "cluster") strippedLabel = strippedLabel.substr(7);
                cl.label = strippedLabel;
                if (!clusterId.empty()) {
                    auto& parent = g.clusters[clusterId];
                    if (std::find(parent.subclusters.begin(), parent.subclusters.end(), id) == parent.subclusters.end())
                        parent.subclusters.push_back(id);
                }
                parseBody(id);
                match(T_RBRACE);
                cl.style = parseStyle(cl.attrs, g.nodeDefaults);
                auto labelIt = cl.attrs.find("label");
                if (labelIt != cl.attrs.end()) cl.label = stripHtml(labelIt->second);
            }
            return;
        }

        // Anonymous subgraph { ... }
        if (peek().type == T_LBRACE) {
            next();
            while (peek().type != T_RBRACE && peek().type != T_EOF) { parseStmt(clusterId); match(T_SEMI); }
            match(T_RBRACE);
            return;
        }

        // Defaults: graph/node/edge [...]
        if ((peek().value == "graph" || peek().value == "node" || peek().value == "edge") &&
            pos + 1 < tok.size() && tok[pos+1].type == T_LBRACK) {
            std::string kind = next().value;
            auto attrs = parseAttrs();
            if (kind == "graph") { for (auto& kv : attrs) g.graphAttrs[kv.first] = kv.second;
                if (!clusterId.empty()) for (auto& kv : attrs) g.clusters[clusterId].attrs[kv.first] = kv.second; }
            else if (kind == "node") for (auto& kv : attrs) g.nodeDefaults[kv.first] = kv.second;
            else for (auto& kv : attrs) g.edgeDefaults[kv.first] = kv.second;
            return;
        }

        // Attr: key = value
        if (isId() && pos + 1 < tok.size() && tok[pos+1].type == T_EQ) {
            std::string key = readId(); next();
            std::string val = (peek().type == T_HTML) ? next().value : readId();
            if (!clusterId.empty()) {
                g.clusters[clusterId].attrs[key] = val;
                if (key == "label") g.clusters[clusterId].label = stripHtml(val);
            } else {
                g.graphAttrs[key] = val;
            }
            return;
        }

        // Node or edge chain
        if (isId()) {
            std::vector<NodeId> ids = { readNodeId() };
            TType arrowType = g.directed ? T_ARROW : T_DASH;
            while (peek().type == arrowType) { next(); ids.push_back(readNodeId()); }
            auto attrs = (peek().type == T_LBRACK) ? parseAttrs() : std::map<std::string, std::string>{};

            if (ids.size() == 1) {
                ensureNode(ids[0].id, attrs, clusterId);
            } else {
                for (size_t i = 0; i + 1 < ids.size(); i++) {
                    ensureNode(ids[i].id, {}, clusterId);
                    ensureNode(ids[i+1].id, {}, clusterId);
                    Edge e;
                    e.from = ids[i].id;
                    e.fromPort = ids[i].port;
                    e.to = ids[i+1].id;
                    e.toPort = ids[i+1].port;
                    auto labelIt = attrs.find("label");
                    if (labelIt != attrs.end()) {
                        e.label = labelIt->second;
                        // Trim spaces
                        while (!e.label.empty() && e.label.front() == ' ') e.label.erase(0, 1);
                        while (!e.label.empty() && e.label.back() == ' ') e.label.pop_back();
                    }
                    e.style = parseEdgeStyle(attrs);
                    e.attrs = attrs;
                    g.edges.push_back(e);
                }
            }
        }
    }

public:
    Parser(std::vector<Token>& tokens, Graph& graph) : tok(tokens), g(graph) {}

    void parse() {
        if (peek().value == "strict") next();
        if (peek().value == "digraph") { next(); g.directed = true; }
        else if (peek().value == "graph") { next(); g.directed = false; }
        if (isId()) readId();
        if (peek().type == T_LBRACE) next();
        parseBody("");
        match(T_RBRACE);
    }
};

// ═══════════════════════════════════════════════════════════════
//  LAYOUT (Sugiyama-style hierarchical)
// ═══════════════════════════════════════════════════════════════

static void measureNode(Node& n) {
    if (n.w > 0 && n.h > 0) return;
    int maxLineLen = 0, lineCount = 1;
    int curLine = 0;
    for (char c : n.label) {
        if (c == '\n') { lineCount++; curLine = 0; }
        else { curLine++; if (curLine > maxLineLen) maxLineLen = curLine; }
    }
    float fs = n.style.fontSize;
    n.w = std::max(maxLineLen * fs * 0.62f + 28.0f, 60.0f);
    n.h = std::max(lineCount * (fs + 3) + 16.0f, 36.0f);

    if (n.shape == "diamond" || n.shape == "Mdiamond") { n.w *= 1.5f; n.h *= 1.5f; }
    else if (n.shape == "circle" || n.shape == "doublecircle") { float r = std::max(n.w, n.h); n.w = r; n.h = r; }
    else if (n.shape == "parallelogram") { n.w *= 1.2f; }
}

static void layout(Graph& g) {
    for (auto& [id, n] : g.nodes) measureNode(n);

    // Build adjacency
    std::unordered_map<std::string, std::vector<std::string>> adj, radj;
    for (auto& e : g.edges) { adj[e.from].push_back(e.to); radj[e.to].push_back(e.from); }

    // Layer assignment via longest path from roots
    std::unordered_map<std::string, int> layerMap;
    int maxLayer = 0;

    // Topological BFS
    std::unordered_map<std::string, int> inDeg;
    for (auto& id : g.nodeOrder) inDeg[id] = 0;
    for (auto& e : g.edges) inDeg[e.to]++;

    std::vector<std::string> queue;
    for (auto& id : g.nodeOrder) { if (inDeg[id] == 0) { queue.push_back(id); layerMap[id] = 0; } }

    size_t qi = 0;
    while (qi < queue.size()) {
        std::string u = queue[qi++];
        for (auto& v : adj[u]) {
            layerMap[v] = std::max(layerMap[v], layerMap[u] + 1);
            maxLayer = std::max(maxLayer, layerMap[v]);
            inDeg[v]--;
            if (inDeg[v] == 0) queue.push_back(v);
        }
    }

    // Handle cycles: assign unvisited nodes
    for (auto& id : g.nodeOrder) {
        if (layerMap.find(id) == layerMap.end()) {
            layerMap[id] = 0;
        }
        g.nodes[id].layer = layerMap[id];
    }

    // Build layers
    std::vector<std::vector<std::string>> layers(maxLayer + 1);
    for (auto& id : g.nodeOrder) layers[g.nodes[id].layer].push_back(id);

    // Barycenter ordering (3 iterations)
    for (int iter = 0; iter < 3; iter++) {
        // Forward pass
        for (int l = 1; l <= maxLayer; l++) {
            std::unordered_map<std::string, float> bary;
            for (auto& id : layers[l]) {
                float sum = 0; int cnt = 0;
                for (auto& p : radj[id]) {
                    if (g.nodes[p].layer == l - 1) {
                        auto it = std::find(layers[l-1].begin(), layers[l-1].end(), p);
                        if (it != layers[l-1].end()) { sum += std::distance(layers[l-1].begin(), it); cnt++; }
                    }
                }
                bary[id] = cnt > 0 ? sum / cnt : 999.0f;
            }
            std::sort(layers[l].begin(), layers[l].end(), [&](auto& a, auto& b) { return bary[a] < bary[b]; });
        }
        // Backward pass
        for (int l = maxLayer - 1; l >= 0; l--) {
            std::unordered_map<std::string, float> bary;
            for (auto& id : layers[l]) {
                float sum = 0; int cnt = 0;
                for (auto& c : adj[id]) {
                    if (g.nodes[c].layer == l + 1) {
                        auto it = std::find(layers[l+1].begin(), layers[l+1].end(), c);
                        if (it != layers[l+1].end()) { sum += std::distance(layers[l+1].begin(), it); cnt++; }
                    }
                }
                bary[id] = cnt > 0 ? sum / cnt : 999.0f;
            }
            std::sort(layers[l].begin(), layers[l].end(), [&](auto& a, auto& b) { return bary[a] < bary[b]; });
        }
    }

    // Assign coordinates
    float layerSpacing = 100.0f;
    auto spacingIt = g.graphAttrs.find("ranksep");
    if (spacingIt != g.graphAttrs.end()) layerSpacing = std::stof(spacingIt->second) * 100.0f;
    float nodeSpacing = 50.0f;
    auto nspacingIt = g.graphAttrs.find("nodesep");
    if (nspacingIt != g.graphAttrs.end()) nodeSpacing = std::stof(nspacingIt->second) * 72.0f;

    for (int l = 0; l <= maxLayer; l++) {
        float totalW = 0;
        for (auto& id : layers[l]) totalW += g.nodes[id].w + nodeSpacing;
        totalW -= nodeSpacing;
        float cx = -totalW / 2;

        for (size_t i = 0; i < layers[l].size(); i++) {
            Node& n = g.nodes[layers[l][i]];
            n.x = cx + n.w / 2;
            n.y = l * (layerSpacing + 50);
            n.order = (int)i;
            cx += n.w + nodeSpacing;
        }
    }

    // Apply manual positions if any
    for (auto& [id, n] : g.nodes) {
        std::string p = "";
        auto it = n.attrs.find("pos");
        if (it != n.attrs.end()) p = it->second;
        else {
            it = n.attrs.find("position");
            if (it != n.attrs.end()) p = it->second;
        }
        if (!p.empty()) {
            if (p.size() >= 2 && p.front() == '"' && p.back() == '"') p = p.substr(1, p.size() - 2);
            if (!p.empty() && p.back() == '!') p.pop_back();
            size_t comma = p.find(',');
            if (comma != std::string::npos) {
                try {
                    n.x = std::stof(p.substr(0, comma));
                    n.y = std::stof(p.substr(comma + 1));
                } catch (...) {}
            }
        }
    }

    // Compute cluster bounds
    for (auto& [cid, cl] : g.clusters) {
        float minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (auto& nid : cl.children) {
            auto it = g.nodes.find(nid);
            if (it == g.nodes.end()) continue;
            Node& n = it->second;
            minX = std::min(minX, n.x - n.w/2);
            minY = std::min(minY, n.y - n.h/2);
            maxX = std::max(maxX, n.x + n.w/2);
            maxY = std::max(maxY, n.y + n.h/2);
        }
        // Include subclusters
        for (auto& scid : cl.subclusters) {
            auto it = g.clusters.find(scid);
            if (it == g.clusters.end()) continue;
            Cluster& sc = it->second;
            if (sc.w > 0) {
                minX = std::min(minX, sc.x - sc.w/2);
                minY = std::min(minY, sc.y - sc.h/2);
                maxX = std::max(maxX, sc.x + sc.w/2);
                maxY = std::max(maxY, sc.y + sc.h/2);
            }
        }
        if (minX > 1e8) { minX = 0; minY = 0; maxX = 100; maxY = 60; }
        float pad = 25.0f;
        float topPad = cl.label.empty() ? pad : pad + 18;
        cl.x = (minX + maxX) / 2;
        cl.y = (minY + maxY) / 2;
        cl.w = (maxX - minX) + pad * 2;
        cl.h = (maxY - minY) + topPad + pad;
    }
}

// ═══════════════════════════════════════════════════════════════
//  EDGE ROUTING
// ═══════════════════════════════════════════════════════════════

struct Pt { float x, y; };

static Pt rectBorder(float cx, float cy, float hw, float hh, float dx, float dy) {
    float ax = std::abs(dx), ay = std::abs(dy);
    if (ax < 0.001f && ay < 0.001f) return {cx + hw, cy};
    float s = (ax * hh > ay * hw) ? hw / ax : hh / ay;
    return {cx + dx * s, cy + dy * s};
}

static Pt ellipseBorder(float cx, float cy, float rx, float ry, float dx, float dy) {
    float a = std::atan2(dy * rx, dx * ry);
    return {cx + rx * std::cos(a), cy + ry * std::sin(a)};
}

static Pt diamondBorder(float cx, float cy, float hw, float hh, float dx, float dy) {
    float ax = std::abs(dx), ay = std::abs(dy);
    float denom = ax * hh + ay * hw;
    if (denom < 0.001f) return {cx + hw, cy};
    float t = (hw * hh) / denom;
    return {cx + dx * t, cy + dy * t};
}

static Pt getPortPt(const Node& n, const std::string& port) {
    float hw = n.w/2, hh = n.h/2;
    if (port == "n") return {n.x, n.y - hh};
    if (port == "s") return {n.x, n.y + hh};
    if (port == "e") return {n.x + hw, n.y};
    if (port == "w") return {n.x - hw, n.y};
    if (port == "ne") return {n.x + hw, n.y - hh};
    if (port == "se") return {n.x + hw, n.y + hh};
    if (port == "nw") return {n.x - hw, n.y - hh};
    if (port == "sw") return {n.x - hw, n.y + hh};
    return {n.x, n.y}; // fallback
}

static Pt borderPt(const Node& n, float tx, float ty, const std::string& port = "") {
    if (!port.empty() && port != "c" && port != "_") {
        if (n.shape == "ellipse" || n.shape == "oval" || n.shape == "circle" || n.shape == "doublecircle") {
            float hw = n.w/2, hh = n.h/2;
            if (port == "n") return {n.x, n.y - hh};
            if (port == "s") return {n.x, n.y + hh};
            if (port == "e") return {n.x + hw, n.y};
            if (port == "w") return {n.x - hw, n.y};
            float a = 0;
            if (port == "ne") a = -M_PI/4;
            else if (port == "nw") a = -3*M_PI/4;
            else if (port == "se") a = M_PI/4;
            else if (port == "sw") a = 3*M_PI/4;
            return {n.x + hw * std::cos(a), n.y + hh * std::sin(a)};
        }
        return getPortPt(n, port);
    }
    float dx = tx - n.x, dy = ty - n.y;
    float hw = n.w / 2, hh = n.h / 2;
    if (n.shape == "ellipse" || n.shape == "oval" || n.shape == "circle" || n.shape == "doublecircle")
        return ellipseBorder(n.x, n.y, hw, hh, dx, dy);
    if (n.shape == "diamond" || n.shape == "Mdiamond")
        return diamondBorder(n.x, n.y, hw, hh, dx, dy);
    return rectBorder(n.x, n.y, hw, hh, dx, dy);
}

// ═══════════════════════════════════════════════════════════════
//  SVG RENDERER
// ═══════════════════════════════════════════════════════════════

static std::string esc(const std::string& s) {
    std::string r;
    for (char c : s) {
        if (c == '<') r += "&lt;";
        else if (c == '>') r += "&gt;";
        else if (c == '&') r += "&amp;";
        else if (c == '"') r += "&quot;";
        else r += c;
    }
    return r;
}

static std::string f2s(float v) {
    char buf[32]; snprintf(buf, sizeof(buf), "%.1f", v); return buf;
}

static std::string renderShape(const Node& n) {
    std::ostringstream o;
    float hw = n.w/2, hh = n.h/2;
    const Style& s = n.style;
    std::string fillAttr = s.filled ? s.fill : "white";
    std::string strokeDash = s.dashed ? " stroke-dasharray=\"6,3\"" : (s.dotted ? " stroke-dasharray=\"2,3\"" : "");
    float sw = s.bold ? s.strokeWidth * 2 : s.strokeWidth;

    if (n.shape == "ellipse" || n.shape == "oval" || n.shape == "circle" || n.shape == "doublecircle") {
        o << "<ellipse rx=\"" << f2s(hw) << "\" ry=\"" << f2s(hh) << "\" fill=\"" << esc(fillAttr) << "\" stroke=\"" << esc(s.stroke) << "\" stroke-width=\"" << f2s(sw) << "\"" << strokeDash << "/>";
    } else if (n.shape == "diamond" || n.shape == "Mdiamond") {
        o << "<polygon points=\"0," << f2s(-hh) << " " << f2s(hw) << ",0 0," << f2s(hh) << " " << f2s(-hw) << ",0\" fill=\"" << esc(fillAttr) << "\" stroke=\"" << esc(s.stroke) << "\" stroke-width=\"" << f2s(sw) << "\"" << strokeDash << "/>";
    } else if (n.shape == "parallelogram") {
        float sk = hw * 0.2f;
        o << "<polygon points=\"" << f2s(-hw+sk) << "," << f2s(-hh) << " " << f2s(hw+sk) << "," << f2s(-hh) << " " << f2s(hw-sk) << "," << f2s(hh) << " " << f2s(-hw-sk) << "," << f2s(hh) << "\" fill=\"" << esc(fillAttr) << "\" stroke=\"" << esc(s.stroke) << "\" stroke-width=\"" << f2s(sw) << "\"" << strokeDash << "/>";
    } else if (n.shape == "plaintext" || n.shape == "plain" || n.shape == "none") {
        o << "<rect x=\"" << f2s(-hw) << "\" y=\"" << f2s(-hh) << "\" width=\"" << f2s(n.w) << "\" height=\"" << f2s(n.h) << "\" fill=\"transparent\" stroke=\"none\"/>";
    } else {
        // box, rect, rectangle, record, etc.
        std::string rx = s.rounded ? " rx=\"6\"" : "";
        o << "<rect x=\"" << f2s(-hw) << "\" y=\"" << f2s(-hh) << "\" width=\"" << f2s(n.w) << "\" height=\"" << f2s(n.h) << "\" fill=\"" << esc(fillAttr) << "\" stroke=\"" << esc(s.stroke) << "\" stroke-width=\"" << f2s(sw) << "\"" << rx << strokeDash << "/>";
    }
    return o.str();
}

static std::string renderNodeSvg(const Node& n) {
    std::ostringstream o;
    o << "<g class=\"gn-node\" data-id=\"" << esc(n.id) << "\" transform=\"translate(" << f2s(n.x) << "," << f2s(n.y) << ")\" style=\"cursor:default\">";
    o << renderShape(n);

    // Label lines
    std::vector<std::string> lines;
    std::istringstream iss(n.label);
    std::string line;
    while (std::getline(iss, line, '\n')) lines.push_back(line);

    for (size_t i = 0; i < lines.size(); i++) {
        float yOff = ((float)i - (float)(lines.size() - 1) / 2.0f) * (n.style.fontSize + 3);
        o << "<text text-anchor=\"middle\" dominant-baseline=\"central\" y=\"" << f2s(yOff) << "\" fill=\"" << esc(n.style.fontColor) << "\" font-family=\"" << esc(n.style.fontFamily) << "\" font-size=\"" << f2s(n.style.fontSize) << "\" style=\"pointer-events:none;user-select:none\">" << esc(lines[i]) << "</text>";
    }
    o << "</g>\n";
    return o.str();
}

static std::string renderEdgeSvg(const Graph& g, const Edge& e, int idx) {
    auto fromIt = g.nodes.find(e.from), toIt = g.nodes.find(e.to);
    if (fromIt == g.nodes.end() || toIt == g.nodes.end()) return "";
    const Node& fn = fromIt->second;
    const Node& tn = toIt->second;

    Pt tempT = e.toPort.empty() || e.toPort == "c" || e.toPort == "_" ? Pt{tn.x, tn.y} : borderPt(tn, fn.x, fn.y, e.toPort);
    Pt tempF = e.fromPort.empty() || e.fromPort == "c" || e.fromPort == "_" ? Pt{fn.x, fn.y} : borderPt(fn, tn.x, tn.y, e.fromPort);

    Pt pf = borderPt(fn, tempT.x, tempT.y, e.fromPort);
    Pt pt = borderPt(tn, tempF.x, tempF.y, e.toPort);

    std::string splines = "curved"; // default
    auto splinesIt = g.graphAttrs.find("splines");
    if (splinesIt != g.graphAttrs.end()) splines = splinesIt->second;

    std::string path;
    float lx = 0, ly = 0; // Label position
    float cx = 0, cy = 0; // Focus for curved

    if (splines == "line" || splines == "false") {
        path = "M" + f2s(pf.x) + "," + f2s(pf.y) + " L" + f2s(pt.x) + "," + f2s(pt.y);
        lx = (pf.x + pt.x) / 2;
        ly = (pf.y + pt.y) / 2;
    } else if (splines == "ortho") {
        std::string rankdir = "TB";
        auto rdIt = g.graphAttrs.find("rankdir");
        if (rdIt != g.graphAttrs.end()) rankdir = rdIt->second;

        if (rankdir == "LR" || rankdir == "RL") {
            float midX = (pf.x + pt.x) / 2;
            path = "M" + f2s(pf.x) + "," + f2s(pf.y) 
                 + " L" + f2s(midX) + "," + f2s(pf.y)
                 + " L" + f2s(midX) + "," + f2s(pt.y)
                 + " L" + f2s(pt.x) + "," + f2s(pt.y);
        } else {
            float midY = (pf.y + pt.y) / 2;
            path = "M" + f2s(pf.x) + "," + f2s(pf.y) 
                 + " L" + f2s(pf.x) + "," + f2s(midY)
                 + " L" + f2s(pt.x) + "," + f2s(midY)
                 + " L" + f2s(pt.x) + "," + f2s(pt.y);
        }
        lx = (pf.x + pt.x) / 2;
        ly = (pf.y + pt.y) / 2;
    } else {
        // curved / true / bezier
        float mx = (pf.x + pt.x) / 2, my = (pf.y + pt.y) / 2;
        float dx = pt.x - pf.x, dy = pt.y - pf.y;
        float len = std::sqrt(dx*dx + dy*dy);
        if (len < 0.1f) len = 1;
        float off = std::min(len * 0.1f, 15.0f);
        float nx = -dy / len * off, ny = dx / len * off;
        cx = mx + nx; cy = my + ny;
        path = "M" + f2s(pf.x) + "," + f2s(pf.y) + " Q" + f2s(cx) + "," + f2s(cy) + " " + f2s(pt.x) + "," + f2s(pt.y);
        lx = (pf.x + 2*cx + pt.x) / 4;
        ly = (pf.y + 2*cy + pt.y) / 4;
    }

    std::ostringstream o;
    std::string arrowId = "a" + std::to_string(idx);
    float sw = e.style.bold ? e.style.strokeWidth * 2 : e.style.strokeWidth;
    std::string dashAttr = e.style.dashed ? " stroke-dasharray=\"8,4\"" : (e.style.dotted ? " stroke-dasharray=\"2,4\"" : "");

    o << "<g class=\"gn-edge\" data-from=\"" << esc(e.from) << "\" data-to=\"" << esc(e.to) << "\">";

    if (!e.style.invis) {
        // Marker
        o << "<defs><marker id=\"" << arrowId << "\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M0,1 L10,5 L0,9 Z\" fill=\"" << esc(e.style.stroke) << "\"/></marker></defs>";
        o << "<path d=\"" << path << "\" fill=\"none\" stroke=\"" << esc(e.style.stroke) << "\" stroke-width=\"" << f2s(sw) << "\"" << dashAttr << " marker-end=\"url(#" << arrowId << ")\"/>";
    }

    // Hit area
    o << "<path d=\"" << path << "\" fill=\"none\" stroke=\"transparent\" stroke-width=\"14\" style=\"cursor:pointer\"/>";

    if (!e.label.empty()) {
        std::string relpos = "center";
        auto rpIt = e.attrs.find("relpos");
        if (rpIt != e.attrs.end()) {
            relpos = rpIt->second;
            if (!relpos.empty() && relpos.front() == '"') relpos = relpos.substr(1, relpos.length() - 2);
        }

        float fLx = lx, fLy = ly;
        if (relpos == "side") {
            float dx = pt.x - pf.x, dy = pt.y - pf.y;
            float len = std::sqrt(dx*dx + dy*dy);
            if (len > 0.01f) {
                // Orthogonal vector
                float nx = -dy / len;
                float ny = dx / len;
                fLx += nx * 24.0f;
                fLy += ny * 24.0f;
            }
        }

        o << "<rect x=\"" << f2s(fLx - 20) << "\" y=\"" << f2s(fLy - 8) << "\" width=\"40\" height=\"16\" fill=\"var(--bg-primary,#0a0a0f)\" rx=\"3\" style=\"pointer-events:none\"/>";
        o << "<text text-anchor=\"middle\" dominant-baseline=\"central\" x=\"" << f2s(fLx) << "\" y=\"" << f2s(fLy) << "\" fill=\"" << esc(e.style.fontColor) << "\" font-family=\"" << esc(e.style.fontFamily) << "\" font-size=\"" << f2s(e.style.fontSize) << "\" style=\"pointer-events:none\">" << esc(e.label) << "</text>";
    }
    o << "</g>\n";
    return o.str();
}

static std::string renderClusterSvg(const Cluster& cl) {
    std::ostringstream o;
    float rx = cl.style.rounded ? 8.0f : 4.0f;
    std::string fillAttr = cl.style.filled ? cl.style.fill : "rgba(255,255,255,0.03)";
    float sw = cl.style.strokeWidth;
    std::string dashAttr = cl.style.dashed ? " stroke-dasharray=\"6,3\"" : "";

    o << "<g class=\"gn-cluster\" data-id=\"" << esc(cl.id) << "\">";
    o << "<rect x=\"" << f2s(cl.x - cl.w/2) << "\" y=\"" << f2s(cl.y - cl.h/2) << "\" width=\"" << f2s(cl.w) << "\" height=\"" << f2s(cl.h) << "\" fill=\"" << esc(fillAttr) << "\" stroke=\"" << esc(cl.style.stroke.empty() ? "#666" : cl.style.stroke) << "\" stroke-width=\"" << f2s(sw) << "\" rx=\"" << f2s(rx) << "\"" << dashAttr << "/>";
    if (!cl.label.empty()) {
        o << "<text x=\"" << f2s(cl.x) << "\" y=\"" << f2s(cl.y - cl.h/2 + 14) << "\" text-anchor=\"middle\" fill=\"" << esc(cl.style.fontColor) << "\" font-family=\"" << esc(cl.style.fontFamily) << "\" font-size=\"" << f2s(cl.style.fontSize) << "\" font-weight=\"600\" style=\"pointer-events:none\">" << esc(cl.label) << "</text>";
    }
    o << "</g>\n";
    return o.str();
}

static std::string renderSvg(const Graph& g) {
    // Compute total bounds
    float minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (auto& [id, n] : g.nodes) {
        minX = std::min(minX, n.x - n.w/2); minY = std::min(minY, n.y - n.h/2);
        maxX = std::max(maxX, n.x + n.w/2); maxY = std::max(maxY, n.y + n.h/2);
    }
    for (auto& [id, cl] : g.clusters) {
        minX = std::min(minX, cl.x - cl.w/2); minY = std::min(minY, cl.y - cl.h/2);
        maxX = std::max(maxX, cl.x + cl.w/2); maxY = std::max(maxY, cl.y + cl.h/2);
    }
    if (minX > 1e8) { minX = 0; minY = 0; maxX = 400; maxY = 300; }
    float pad = 40;

    std::ostringstream svg;
    svg << "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" height=\"100%\" viewBox=\""
        << f2s(minX - pad) << " " << f2s(minY - pad) << " " << f2s(maxX - minX + pad*2) << " " << f2s(maxY - minY + pad*2)
        << "\" style=\"overflow:visible;background:transparent\">";

    // Glow filter
    svg << "<defs><filter id=\"glow\"><feGaussianBlur stdDeviation=\"3\" result=\"b\"/><feFlood flood-color=\"#6c5ce7\" flood-opacity=\"0.5\" result=\"c\"/><feComposite in=\"c\" in2=\"b\" operator=\"in\" result=\"s\"/><feMerge><feMergeNode in=\"s\"/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter></defs>";

    svg << "<g class=\"gn-root\">";

    // Clusters
    for (auto& [id, cl] : g.clusters) svg << renderClusterSvg(cl);
    // Edges
    for (size_t i = 0; i < g.edges.size(); i++) svg << renderEdgeSvg(g, g.edges[i], (int)i);
    // Nodes (on top)
    for (auto& id : g.nodeOrder) {
        auto it = g.nodes.find(id);
        if (it != g.nodes.end()) svg << renderNodeSvg(it->second);
    }

    svg << "</g></svg>";
    return svg.str();
}

// ═══════════════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════════════

static char* lastResult = nullptr;

extern "C" {

const char* gn_render(const char* src) {
    if (lastResult) { free(lastResult); lastResult = nullptr; }

    std::string input(src);
    auto tokens = tokenize(input);
    Graph g;
    Parser parser(tokens, g);
    parser.parse();
    layout(g);
    std::string svg = renderSvg(g);

    lastResult = (char*)malloc(svg.size() + 1);
    memcpy(lastResult, svg.c_str(), svg.size() + 1);
    return lastResult;
}

void gn_free() {
    if (lastResult) { free(lastResult); lastResult = nullptr; }
}

// Return JSON with node positions for JS interaction layer
const char* gn_positions(const char* src) {
    if (lastResult) { free(lastResult); lastResult = nullptr; }

    std::string input(src);
    auto tokens = tokenize(input);
    Graph g;
    Parser parser(tokens, g);
    parser.parse();
    layout(g);

    std::ostringstream json;
    json << "{";
    bool first = true;
    for (auto& [id, n] : g.nodes) {
        if (!first) json << ",";
        first = false;
        json << "\"" << esc(id) << "\":{\"x\":" << f2s(n.x) << ",\"y\":" << f2s(n.y)
             << ",\"w\":" << f2s(n.w) << ",\"h\":" << f2s(n.h) << "}";
    }
    json << "}";

    std::string result = json.str();
    lastResult = (char*)malloc(result.size() + 1);
    memcpy(lastResult, result.c_str(), result.size() + 1);
    return lastResult;
}

} // extern "C"
