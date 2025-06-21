// 全局变量
let provider, signer, groupChatContract, nftContract, account;
let contractAddress = '';
let nftAddress = '';
let messagePollingInterval = null; // 轮询间隔ID
let isProcessingMessage = false; // 消息处理状态标志
let roleName = ''; // 角色名称变量

// DOM元素
const connectBtn = document.getElementById('connect-btn');
const sendBtn = document.getElementById('send-btn');
const messageInput = document.getElementById('message-input');
const messageList = document.getElementById('message-list');
const nftList = document.getElementById('nft-list');
const statusText = document.getElementById('status-text');
const accountAddress = document.getElementById('account-address');
const messageCount = document.getElementById('message-count');
const contractAddressInput = document.getElementById('contract-address');
const privateKeyInput = document.getElementById('private-key');
const roleNameInput = document.getElementById('role-name');

// 合约ABI
const groupChatABI = [
  "function sendMessage(string memory content) external",
  "function getMessageCount() external view returns (uint256)",
  "function getMessage(uint256 index) external view returns (address, string memory, uint256)",
  "function messageCount() external view returns (uint256)",
  "function nftContract() external view returns (address)"
];

const nftABI = [
  "function mintNFT(string memory metadata) external",
  "function getMetadata(uint256 tokenId) external view returns (string memory)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  updateStatus('准备就绪');

  // 尝试从本地存储加载合约地址和角色名
  const savedAddress = localStorage.getItem('chatContractAddress');
  if (savedAddress) {
    contractAddressInput.value = savedAddress;
  }

  const savedRoleName = localStorage.getItem('chatRoleName');
  if (savedRoleName) {
    roleNameInput.value = savedRoleName;
  }

  // 连接钱包按钮事件
  connectBtn.addEventListener('click', connectWallet);

  // 发送消息按钮事件
  sendBtn.addEventListener('click', sendMessage);

  // 输入框回车发送
  messageInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
});

// 更新状态
function updateStatus(text) {
  statusText.textContent = text;
  statusText.style.color = '#3498db';
}

// 显示错误
function showError(text) {
  statusText.textContent = text;
  statusText.style.color = '#e74c3c';
}

// 连接钱包
async function connectWallet() {
  updateStatus('连接中...');

  // 获取合约地址和角色名
  contractAddress = contractAddressInput.value.trim();
  const privateKey = privateKeyInput.value.trim();
  roleName = roleNameInput.value.trim() || '匿名'; // 默认值

  if (!contractAddress || !privateKey) {
    showError('请填写合约地址和私钥');
    return;
  }

  try {
    // 保存合约地址和角色名到本地存储
    localStorage.setItem('chatContractAddress', contractAddress);
    localStorage.setItem('chatRoleName', roleName);

    // 设置Provider（BSC测试网）
    provider = new ethers.providers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');

    // 创建Signer
    signer = new ethers.Wallet(privateKey, provider);
    account = signer.address;

    // 更新UI显示账户
    accountAddress.textContent = `${account.substring(0, 6)}...${account.substring(38)}`;

    // 初始化群聊合约
    groupChatContract = new ethers.Contract(contractAddress, groupChatABI, signer);

    // 自动获取NFT合约地址
    try {
      nftAddress = await groupChatContract.nftContract();
      updateStatus(`已自动获取NFT合约地址: ${nftAddress.substring(0, 10)}...`);

      // 初始化NFT合约
      nftContract = new ethers.Contract(nftAddress, nftABI, signer);
    } catch (e) {
      console.warn('无法获取NFT合约地址:', e);
      showError('无法获取NFT合约地址，历史消息功能受限');
    }

    // 加载消息
    await loadMessages();

    updateStatus('已连接到BSC测试网');

    // 启动轮询机制检查新消息
    startMessagePolling();
  } catch (error) {
    console.error('连接错误:', error);
    showError('连接失败: ' + error.message);
  }
}

// 启动消息轮询
function startMessagePolling() {
  // 清除现有轮询
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval);
  }

  // 每3秒检查一次新消息
  messagePollingInterval = setInterval(async () => {
    try {
      if (!groupChatContract || isProcessingMessage) return;

      // 获取当前消息数量
      const currentCount = parseInt(messageCount.textContent);
      const blockchainCount = await groupChatContract.getMessageCount();

      // 如果有新消息
      if (blockchainCount > currentCount) {
        // 加载新增消息
        await loadNewMessages(currentCount, blockchainCount);
      }
    } catch (error) {
      console.error('轮询错误:', error);
    }
  }, 3000); // 3秒轮询一次
}

// 加载新消息
async function loadNewMessages(startIndex, endIndex) {
  if (isProcessingMessage) return;
  isProcessingMessage = true;

  try {
    // 加载新增消息
    for (let i = startIndex; i < endIndex; i++) {
      const [sender, content, timestamp] = await groupChatContract.getMessage(i);

      // 解析消息内容
      const parsed = parseMessage(content);
      const isMe = parsed.role === roleName;

      // 检查是否已存在相同的消息
      const messageExists = Array.from(messageList.children).some(el => {
        const roleEl = el.querySelector('.message-role');
        const contentDiv = el.querySelector('.message-content');

        return roleEl && roleEl.textContent === parsed.role &&
          contentDiv && contentDiv.textContent === parsed.content;
      });

      if (messageExists) {
        console.log('消息已存在，跳过添加:', parsed.content);
        continue;
      }

      // 创建消息元素
      const messageEl = document.createElement('div');
      messageEl.className = isMe ? 'message me' : 'message';

      // 格式化时间
      const timeString = formatTime(timestamp);

      messageEl.innerHTML = `
        <div class="message-header">
          <div class="message-role">${parsed.role}</div>
          <span>${timeString}</span>
        </div>
        <div class="message-content">${parsed.content}</div>
      `;

      messageList.appendChild(messageEl);
    }

    // 更新消息计数
    messageCount.textContent = endIndex;

    // 滚动到底部
    messageList.scrollTop = messageList.scrollHeight;
  } catch (error) {
    console.error('加载新消息错误:', error);
  } finally {
    isProcessingMessage = false;
  }
}

// 消息解析函数
function parseMessage(content) {
  // 解析格式：(角色名)*消息内容
  const match = content.match(/^\((.*?)\)\*(.*)$/);

  if (match && match.length === 3) {
    return {
      role: match[1],  // 提取角色名称
      content: match[2]
    };
  }

  // 兼容旧格式消息
  return {
    role: '匿名',
    content
  };
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 发送消息
async function sendMessage() {

  /*
  // 这里是消息发送的时候可以更新当前填写的名字（我是觉得这个功能不错，但是不行，必须给他们瞎改马甲加成本）
  roleName = roleNameInput.value.trim() || '匿名';
  localStorage.setItem('chatRoleName', roleName);
  */
  const content = messageInput.value.trim();
  if (!content || isProcessingMessage) return;

  updateStatus('发送中...');
  isProcessingMessage = true;

  try {
    // 添加角色名称前缀
    const fullContent = `(${roleName})*${content}`;

    // 发送消息到区块链
    const tx = await groupChatContract.sendMessage(fullContent);
    await tx.wait();

    // 清空输入框
    messageInput.value = '';

    // 更新状态
    updateStatus('消息发送成功！');

    // 获取当前消息数量
    const blockchainCount = await groupChatContract.getMessageCount();
    const currentCount = parseInt(messageCount.textContent);

    // 更新消息计数
    messageCount.textContent = blockchainCount;

    // 直接添加新消息到UI（避免等待轮询）
    const [sender, , timestamp] = await groupChatContract.getMessage(blockchainCount - 1);

    const messageEl = document.createElement('div');
    messageEl.className = 'message me'; // 发送者总是自己

    const timeString = formatTime(timestamp);

    messageEl.innerHTML = `
      <div class="message-header">
        <div class="message-role">${roleName}</div>
        <span>${timeString}</span>
      </div>
      <div class="message-content">${content}</div>
    `;

    messageList.appendChild(messageEl);

    // 滚动到底部
    messageList.scrollTop = messageList.scrollHeight;
  } catch (error) {
    console.error('发送错误:', error);
    showError('发送失败: ' + error.message);
  } finally {
    isProcessingMessage = false;
  }
}

// 加载消息
async function loadMessages() {
  if (!groupChatContract) return;

  try {
    // 清空消息列表
    messageList.innerHTML = '';

    // 获取消息数量
    const count = await groupChatContract.getMessageCount();
    messageCount.textContent = `${count}`;

    // 加载所有消息
    for (let i = 0; i < count; i++) {
      const [sender, content, timestamp] = await groupChatContract.getMessage(i);

      // 解析消息内容
      const parsed = parseMessage(content);
      const isMe = parsed.role === roleName;

      // 创建消息元素
      const messageEl = document.createElement('div');
      messageEl.className = isMe ? 'message me' : 'message';

      // 格式化时间
      const timeString = formatTime(timestamp);

      messageEl.innerHTML = `
        <div class="message-header">
          <div class="message-role">${parsed.role}</div>
          <span>${timeString}</span>
        </div>
        <div class="message-content">${parsed.content}</div>
      `;

      messageList.appendChild(messageEl);
    }

    // 滚动到底部
    messageList.scrollTop = messageList.scrollHeight;

    // 加载NFT历史
    if (nftContract) {
      await loadNFTs();
    }
  } catch (error) {
    console.error('加载消息错误:', error);
    showError('加载消息失败: ' + error.message);
  }
}

// 加载NFT历史
async function loadNFTs() {
  if (!nftContract || !account) return;

  try {
    // 清空NFT列表
    nftList.innerHTML = '';

    // 获取NFT总量
    const totalNFTs = await nftContract.totalSupply();

    // 创建标题
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = `历史消息包 (共 ${totalNFTs} 个)`;
    nftList.appendChild(title);

    // 获取用户拥有的NFT数量
    const balance = await nftContract.balanceOf(account);

    // 加载每个NFT
    for (let i = 0; i < balance; i++) {
      const tokenId = await nftContract.tokenOfOwnerByIndex(account, i);

      const nftItem = document.createElement('div');
      nftItem.className = 'nft-item';
      nftItem.innerHTML = `
        <span class="nft-id">#${tokenId.toString()}</span>
        <span>历史消息包</span>
      `;
      nftItem.dataset.tokenId = tokenId.toString();

      nftItem.addEventListener('click', async () => {
        await loadNFTMessages(tokenId);
      });

      nftList.appendChild(nftItem);
    }

    // 如果没有NFT，显示提示
    if (balance === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'nft-item';
      emptyMsg.textContent = '暂无历史消息包';
      nftList.appendChild(emptyMsg);
    }
  } catch (error) {
    console.error('加载NFT错误:', error);
  }
}

// 加载NFT消息
async function loadNFTMessages(tokenId) {
  try {
    // 获取NFT元数据
    const metadata = await nftContract.getMetadata(tokenId);

    // 清空消息列表
    messageList.innerHTML = '';

    // 添加标题
    const title = document.createElement('div');
    title.className = 'message';
    title.innerHTML = `
      <div class="message-header">
        <span>历史消息包 #${tokenId}</span>
      </div>
      <div class="message-content">以下为存档的历史消息</div>
    `;
    messageList.appendChild(title);

    // 解析元数据
    const messages = metadata.split(';');

    for (const msg of messages) {
      if (!msg) continue;

      const parts = msg.split('|');
      if (parts.length < 3) continue;

      const sender = parts[0];
      const content = parts[1];
      const timestamp = parseInt(parts[2]);

      // 解析消息内容

      const parsed = parseMessage(content);
      const isMe = parsed.role === roleName;
      messageEl.className = isMe ? 'message me' : 'message';

      // 创建消息元素
      const messageEl = document.createElement('div');
      messageEl.className = 'message';

      // 格式化时间
      const date = new Date(timestamp * 1000);
      const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      messageEl.innerHTML = `
        <div class="message-header">
          <div class="message-role">${parsed.role}</div>
          <span>${timeString}</span>
        </div>
        <div class="message-content">${parsed.content}</div>
      `;

      messageList.appendChild(messageEl);
    }

    // 显示状态
    updateStatus(`已加载历史消息包 #${tokenId}`);

    // 滚动到底部
    messageList.scrollTop = messageList.scrollHeight;
  } catch (error) {
    console.error('加载NFT消息错误:', error);
    showError('加载历史消息失败: ' + error.message);
  }
}
